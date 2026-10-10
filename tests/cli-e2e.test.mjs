// End to end: the real built CLI (a separate process) against the real route
// handlers and MongoDB, served over HTTP. Requires `npm run cli:build`
// (`npm test` does that first).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_CLIE2E_MONGODB_URI ??
  "mongodb://127.0.0.1:27017/keel_clie2e_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "cli", "dist", "index.js");
assert.ok(existsSync(CLI), "build the CLI first: npm run cli:build");

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  member: ["member@corp.test"],
};

const SECRET_A = "super-secret-A-value-123";
const SECRET_B = "stdin secret value with spaces";
const SECRET_PROD = "PROD-ONLY-secret-value";

let backend, client, db, P, tmp;
const outputs = []; // every byte the CLI printed, for the leak sweep
const seenTokens = new Set();

const web = async (user, method, p, body) => {
  const res = await fetch(backend.url + p, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

function cliEnv(configDir, extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.KEEL_API_URL;
  env.KEEL_CONFIG_DIR = configDir;
  env.KEEL_CREDENTIAL_STORE = "file";
  return env;
}

/** Runs the CLI to completion. */
function runCli(args, { cwd, configDir, input, env = {}, record = true } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
      env: cliEnv(configDir, env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      if (record) outputs.push(stdout, stderr);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input ?? "");
  });
}

/** Runs `login`, approving the code in the "browser" as `user`. */
async function loginAs(user, configDir, cwd) {
  resetRateLimits();
  const child = spawn(
    process.execPath,
    [CLI, "login", "--api-url", backend.url, "--no-browser"],
    { cwd, env: cliEnv(configDir), stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let approved = false;
  const done = new Promise((resolve) =>
    child.on("close", (code) => {
      outputs.push(stdout, stderr);
      resolve({ code, stdout, stderr });
    }),
  );
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", async (d) => {
    stderr += d;
    const m = /Code: ([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(stderr);
    if (m && !approved) {
      approved = true;
      const r = await web(user, "POST", "/api/cli/auth/approve", { userCode: m[1] });
      assert.equal(r.status, 200);
    }
  });
  return done;
}

async function credentials(configDir) {
  const file = path.join(configDir, "credentials.json");
  const creds = JSON.parse(await readFile(file, "utf8"));
  seenTokens.add(creds.accessToken);
  seenTokens.add(creds.refreshToken);
  return creds;
}

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();
  tmp = await mkdtemp(path.join(os.tmpdir(), "keel-cli-"));

  P = (await web("owner", "POST", "/api/projects", {
    name: "E2E Project",
    environments: ["development", "production"],
  })).body.project.id;
  const inv = await web("owner", "POST", `/api/projects/${P}/invitations`, { email: "member@corp.test", role: "member" });
  await web("member", "POST", "/api/invitations/accept", { token: inv.body.devAcceptUrl.split("#")[1] });
  await web("owner", "PUT", `/api/projects/${P}/environments/development/access/member`);
  await web("owner", "POST", `/api/projects/${P}/environments/production/secrets`, { key: "PROD_ONLY", value: SECRET_PROD });
});
after(async () => {
  await backend.close();
  await db.dropDatabase();
  await client.close();
  await rm(tmp, { recursive: true, force: true });
  process.exit(0);
});

const dirs = () => ({
  cfg: path.join(tmp, "cfg-member"),
  work: path.join(tmp, "work dir"), // a space on purpose
});

test("help, version and usage errors", async () => {
  const { cfg, work } = dirs();
  await mkdir(work, { recursive: true });
  for (const args of [[], ["--help"], ["help"]]) {
    const r = await runCli(args, { cwd: work, configDir: cfg });
    assert.equal(r.code, 0);
    for (const word of ["login", "logout", "init", "secrets list", "secrets set", "run --"])
      assert.ok(r.stdout.includes(word), `${word} in help`);
  }
  for (const [args, text] of [
    [["secrets", "--help"], "list"],
    [["secrets", "set", "--help"], "shell history"],
    [["run", "--help"], "process inspection"],
    [["init", "--help"], ".keel.json"],
    [["login", "--help"], "--api-url"],
  ]) {
    const r = await runCli(args, { cwd: work, configDir: cfg });
    assert.equal(r.code, 0);
    assert.ok(r.stdout.includes(text), `${args.join(" ")} mentions ${text}`);
  }
  assert.match((await runCli(["--version"], { cwd: work, configDir: cfg })).stdout, /^\d+\.\d+\.\d+/);

  const bad = await runCli(["frobnicate"], { cwd: work, configDir: cfg });
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /Unknown command/);
  const flag = await runCli(["secrets", "list", "--nope"], { cwd: work, configDir: cfg });
  assert.equal(flag.code, 2);
});

test("missing configuration and missing login are explained", async () => {
  const { cfg, work } = dirs();
  const noConfig = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.equal(noConfig.code, 1);
  assert.match(noConfig.stderr, /keel init/);

  await writeFile(path.join(work, ".keel.json"), JSON.stringify({
    apiUrl: backend.url, projectId: P, environment: "development",
  }));
  const noLogin = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.equal(noLogin.code, 1);
  assert.match(noLogin.stderr, /keel login/);
  await rm(path.join(work, ".keel.json"));
});

test("config is validated before use", async () => {
  const { cfg, work } = dirs();
  const file = path.join(work, ".keel.json");
  for (const bad of [
    "not json",
    JSON.stringify({ apiUrl: "http://example.com", projectId: P, environment: "development" }), // http, non-local
    JSON.stringify({ apiUrl: backend.url, projectId: "../etc", environment: "development" }),
    JSON.stringify({ apiUrl: backend.url, projectId: P, environment: "Dev Env!" }),
    JSON.stringify([1, 2]),
  ]) {
    await writeFile(file, bad);
    const r = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
    assert.equal(r.code, 1, bad);
    assert.match(r.stderr, /Invalid|not valid JSON|https/);
  }
  await rm(file);
});

test("login stores credentials without ever printing them", async () => {
  const { cfg, work } = dirs();
  const r = await loginAs("member", cfg, work);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /Logged in as member@corp\.test/);
  const creds = await credentials(cfg);
  assert.match(creds.accessToken, /^keel_at_/);
  for (const out of [r.stdout, r.stderr]) {
    assert.ok(!out.includes(creds.accessToken));
    assert.ok(!out.includes(creds.refreshToken));
  }
  if (process.platform !== "win32") {
    assert.equal((await stat(path.join(cfg, "credentials.json"))).mode & 0o777, 0o600);
  }
});

test("init saves identifiers only, and only authorized choices", async () => {
  const { cfg, work } = dirs();
  const denied = await runCli(["init", "--project", P, "--env", "production"], { cwd: work, configDir: cfg });
  assert.equal(denied.code, 1);
  assert.match(denied.stderr, /not available to you/);
  assert.ok(!existsSync(path.join(work, ".keel.json")));

  const nope = await runCli(["init", "--project", "does-not-exist"], { cwd: work, configDir: cfg });
  assert.equal(nope.code, 1);
  assert.match(nope.stderr, /not found or you do not have access/);

  const ok = await runCli(["init", "--project", P, "--env", "development"], { cwd: work, configDir: cfg });
  assert.equal(ok.code, 0, ok.stderr);
  assert.match(ok.stderr, /keel init/); // how to change it
  assert.match(ok.stderr, /\.gitignore/); // advice, since it is not ignored yet

  const config = JSON.parse(await readFile(path.join(work, ".keel.json"), "utf8"));
  assert.deepEqual(Object.keys(config).sort(), ["apiUrl", "environment", "projectId", "projectName"]);
  assert.equal(config.projectId, P);
  assert.equal(config.environment, "development");
  const text = JSON.stringify(config);
  for (const t of seenTokens) assert.ok(!text.includes(t));
});

test("secrets set: create, update, unchanged, stdin; values are never printed", async () => {
  const { cfg, work } = dirs();
  const created = await runCli(["secrets", "set", `DB_PASSWORD=${SECRET_A}`], { cwd: work, configDir: cfg });
  assert.equal(created.code, 0, created.stderr);
  assert.match(created.stderr, /Created DB_PASSWORD \(v1\)/);
  assert.match(created.stderr, /shell history/);

  const updated = await runCli(["secrets", "set", "DB_PASSWORD=" + SECRET_A + "-new"], { cwd: work, configDir: cfg });
  assert.match(updated.stderr, /Updated DB_PASSWORD \(v2\)/);
  const same = await runCli(["secrets", "set", "DB_PASSWORD=" + SECRET_A + "-new"], { cwd: work, configDir: cfg });
  assert.match(same.stderr, /Unchanged DB_PASSWORD \(v2\)/);

  const piped = await runCli(["secrets", "set", "API_TOKEN", "--stdin"], { cwd: work, configDir: cfg, input: SECRET_B + "\n" });
  assert.equal(piped.code, 0, piped.stderr);
  assert.match(piped.stderr, /Created API_TOKEN/);
  assert.ok(!/shell history/.test(piped.stderr)); // no value on the command line

  // validation
  for (const [args, re] of [
    [["secrets", "set", "1BAD=x"], /not a valid key/],
    [["secrets", "set", "NO SPACE=x"], /not a valid key/],
    [["secrets", "set", "EMPTY="], /empty/],
    [["secrets", "set", "A=1", "A=2"], /more than once/],
    [["secrets", "set"], /KEY=VALUE/],
  ]) {
    const r = await runCli(args, { cwd: work, configDir: cfg });
    assert.equal(r.code, 1, args.join(" "));
    assert.match(r.stderr, re);
  }

  // stored encrypted, with history and audit
  const rows = await db.collection("secrets").find({ key: { $in: ["DB_PASSWORD", "API_TOKEN"] } }).toArray();
  assert.equal(rows.length, 2);
  assert.ok(!JSON.stringify(rows).includes("super-secret"));
  const hist = await db.collection("secret_versions").countDocuments({ secretId: rows.find((r) => r.key === "DB_PASSWORD")._id });
  assert.equal(hist, 2);
  const audit = await db.collection("audit_logs").find({ action: { $in: ["secret.created", "secret.updated"] }, "metadata.key": "DB_PASSWORD" }).toArray();
  assert.equal(audit.length, 2);
  assert.ok(audit.every((a) => a.metadata.via === "cli"));
});

test("secrets list masks by default and reveals only on request", async () => {
  const { cfg, work } = dirs();
  const masked = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.equal(masked.code, 0, masked.stderr);
  assert.match(masked.stdout, /DB_PASSWORD/);
  assert.match(masked.stdout, /API_TOKEN/);
  assert.match(masked.stdout, /\*{8}/);
  assert.ok(!masked.stdout.includes("super-secret"));
  assert.ok(!masked.stdout.includes(SECRET_B));

  const json = await runCli(["secrets", "list", "--json"], { cwd: work, configDir: cfg });
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual(parsed.map((s) => Object.keys(s).sort().join()), ["key,updatedAt,version", "key,updatedAt,version"]);

  const before = await db.collection("audit_logs").countDocuments({ action: "secrets.exported" });
  // The one deliberate disclosure: not part of the leak sweep.
  const shown = await runCli(["secrets", "list", "--reveal"], { cwd: work, configDir: cfg, record: false });
  assert.equal(shown.code, 0, shown.stderr);
  assert.ok(shown.stdout.includes(`API_TOKEN=${SECRET_B}`));
  assert.match(shown.stderr, /audit log/);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "secrets.exported" }), before + 1);

  // not authorized for production
  const prod = await runCli(["secrets", "list", "--env", "production"], { cwd: work, configDir: cfg });
  assert.equal(prod.code, 1);
  assert.match(prod.stderr, /do not have access to this environment/);
  assert.ok(!prod.stdout.includes(SECRET_PROD));
});

const printer = `
const fs = require("node:fs");
const out = process.argv[2];
fs.writeFileSync(out, JSON.stringify({
  args: process.argv.slice(3),
  DB_PASSWORD: process.env.DB_PASSWORD,
  API_TOKEN: process.env.API_TOKEN,
  OVERRIDE_ME: process.env.OVERRIDE_ME,
  PROD_ONLY: process.env.PROD_ONLY ?? null,
}));
`;

test("run injects secrets, handles spaces and extra args, writes nothing to disk", async () => {
  const { cfg, work } = dirs();
  const scriptDir = path.join(tmp, "my scripts");
  await mkdir(scriptDir, { recursive: true });
  const script = path.join(scriptDir, "print env.js");
  await writeFile(script, printer);
  const outFile = path.join(tmp, "child output.json");

  const before = (await readdir(work)).sort();
  const r = await runCli(
    ["run", "--", process.execPath, script, outFile, "two words", "--flag=a b", "it's", 'say "hi"'],
    { cwd: work, configDir: cfg, env: { OVERRIDE_ME: "from-parent" } },
  );
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /Injecting 2 secrets/);
  for (const out of [r.stdout, r.stderr]) {
    assert.ok(!out.includes(SECRET_A));
    assert.ok(!out.includes("super-secret"));
    assert.ok(!out.includes(SECRET_B));
  }

  const seen = JSON.parse(await readFile(outFile, "utf8"));
  assert.equal(seen.DB_PASSWORD, SECRET_A + "-new");
  assert.equal(seen.API_TOKEN, SECRET_B);
  assert.equal(seen.OVERRIDE_ME, "from-parent");
  assert.equal(seen.PROD_ONLY, null); // other environment is not leaked
  assert.deepEqual(seen.args, ["two words", "--flag=a b", "it's", 'say "hi"']);

  // nothing persisted: no .env, no new files next to the project
  assert.deepEqual((await readdir(work)).sort(), before);
  const files = await readdir(tmp);
  assert.ok(!files.some((f) => /^\.env/.test(f)));
});

test("run does not pass secrets through the command line", async () => {
  const { cfg, work } = dirs();
  const script = path.join(tmp, "argv.js");
  const outFile = path.join(tmp, "argv.json");
  await writeFile(script, `require("node:fs").writeFileSync(process.argv[2], JSON.stringify(process.argv));`);
  const r = await runCli(["run", "--", process.execPath, script, outFile], { cwd: work, configDir: cfg });
  assert.equal(r.code, 0, r.stderr);
  const argv = await readFile(outFile, "utf8");
  assert.ok(!argv.includes("super-secret"));
  assert.ok(!argv.includes(SECRET_B));
});

test("run propagates the child's exit code and reports a missing command", async () => {
  const { cfg, work } = dirs();
  for (const code of [0, 3, 42]) {
    const r = await runCli(["run", "--", process.execPath, "-e", `process.exit(${code})`], { cwd: work, configDir: cfg });
    assert.equal(r.code, code);
  }
  const missing = await runCli(["run", "--", "definitely-not-a-real-command-xyz"], { cwd: work, configDir: cfg });
  assert.equal(missing.code, 127);
  assert.match(missing.stderr, /Command not found/);
  const none = await runCli(["run"], { cwd: work, configDir: cfg });
  assert.equal(none.code, 1);
  assert.match(none.stderr, /after `--`/);
});

test("run refuses an unauthorized environment and never starts the command", async () => {
  const { cfg, work } = dirs();
  const marker = path.join(tmp, "should-not-exist.txt");
  const r = await runCli(
    ["run", "--env", "production", "--", process.execPath, "-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "x")`],
    { cwd: work, configDir: cfg },
  );
  assert.equal(r.code, 1);
  assert.match(r.stderr, /do not have access to this environment/);
  assert.ok(!existsSync(marker));
  assert.ok(!r.stdout.includes(SECRET_PROD) && !r.stderr.includes(SECRET_PROD));
});

test("run starts npm and other .cmd shims correctly on Windows", { skip: process.platform !== "win32" }, async () => {
  const { cfg, work } = dirs();
  const r = await runCli(["run", "--", "npm", "--version"], { cwd: work, configDir: cfg });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\d+\.\d+\.\d+/);

  // a .cmd file in a path with spaces, arguments with spaces and quotes
  const dir = path.join(tmp, "cmd dir");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "show args.cmd");
  await writeFile(file, "@echo off\r\necho [%~1] [%~2]\r\nexit /b 5\r\n");
  const c = await runCli(["run", "--", file, "a b", "c"], { cwd: work, configDir: cfg });
  assert.equal(c.code, 5);
  assert.match(c.stdout, /\[a b\] \[c\]/);
});

test("signals are forwarded and the child is cleaned up", { skip: process.platform === "win32" && "Windows has no POSIX signal delivery to test" }, async () => {
  const { cfg, work } = dirs();
  const marker = path.join(tmp, "got-term.txt");
  const code = `
    const fs=require("fs");
    process.on("SIGTERM",()=>{fs.writeFileSync(${JSON.stringify(marker)},"term");process.exit(9)});
    console.log("ready"); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, [CLI, "run", "--", process.execPath, "-e", code], {
    cwd: work, env: cliEnv(cfg), stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolve) => child.stdout.on("data", (d) => String(d).includes("ready") && resolve()));
  child.kill("SIGTERM");
  const exit = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(exit, 9);
  assert.equal(await readFile(marker, "utf8"), "term");
});

test("a revoked session is reported clearly and local credentials are cleared", async () => {
  const { cfg, work } = dirs();
  await db.collection("cli_sessions").updateMany({}, { $set: { revokedAt: new Date() } });
  const r = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /expired or was revoked/);
  assert.match(r.stderr, /keel login/);
  assert.ok(!existsSync(path.join(cfg, "credentials.json")));
});

test("an expired access token is refreshed transparently", async () => {
  const { cfg, work } = dirs();
  const login = await loginAs("member", cfg, work);
  assert.equal(login.code, 0, login.stderr);
  const before = await credentials(cfg);
  await db.collection("cli_sessions").updateMany(
    { revokedAt: { $exists: false } },
    { $set: { accessExpiresAt: new Date(Date.now() - 1000) } },
  );
  const r = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.equal(r.code, 0, r.stderr);
  const after = await credentials(cfg);
  assert.notEqual(after.accessToken, before.accessToken);
  assert.notEqual(after.refreshToken, before.refreshToken);
});

test("logout revokes the session and removes credentials", async () => {
  const { cfg, work } = dirs();
  const creds = await credentials(cfg);
  const out = await runCli(["logout"], { cwd: work, configDir: cfg });
  assert.equal(out.code, 0, out.stderr);
  assert.match(out.stderr, /Logged out/);
  assert.ok(!existsSync(path.join(cfg, "credentials.json")));

  const res = await fetch(`${backend.url}/api/projects`, { headers: { authorization: `Bearer ${creds.accessToken}` } });
  assert.equal(res.status, 401);

  const again = await runCli(["secrets", "list"], { cwd: work, configDir: cfg });
  assert.match(again.stderr, /not logged in/);
});

test("Windows credential store keeps tokens out of plaintext", { skip: process.platform !== "win32" }, async () => {
  const dir = path.join(tmp, "dpapi");
  process.env.KEEL_CONFIG_DIR = dir;
  const { DpapiStore } = await import(pathToFileURL(path.join(root, "cli", "dist", "credentials.js")).href);
  const store = new DpapiStore();
  const creds = {
    apiUrl: "https://example.test",
    accessToken: "keel_at_" + randomBytes(24).toString("base64url"),
    refreshToken: "keel_rt_" + randomBytes(24).toString("base64url"),
    accessExpiresAt: new Date().toISOString(),
    refreshExpiresAt: new Date().toISOString(),
    email: "ünï@example.test",
  };
  await store.write(creds);
  const onDisk = await readFile(path.join(dir, "credentials.dpapi"), "utf8");
  assert.ok(!onDisk.includes(creds.accessToken));
  assert.ok(!onDisk.includes("example.test"));
  assert.deepEqual(await store.read(), creds);
  await store.delete();
  assert.equal(await store.read(), null);
  delete process.env.KEEL_CONFIG_DIR;
});

test("argument planning for Windows batch shims", async () => {
  const mod = await import(pathToFileURL(path.join(root, "cli", "dist", "spawn.js")).href);
  if (process.platform === "win32") {
    const plan = mod.planSpawn("C:\\Program Files\\nodejs\\npm.cmd", ["run", "dev server", "a&b"]);
    assert.match(plan.file, /cmd(\.exe)?$/i);
    assert.equal(plan.verbatim, true);
    assert.deepEqual(plan.args.slice(0, 3), ["/d", "/s", "/c"]);
    // the & cannot act as a command separator
    assert.ok(plan.args[3].includes("a^&b"));
  } else {
    const plan = mod.planSpawn("/usr/bin/env", ["a b"]);
    assert.deepEqual(plan, { file: "/usr/bin/env", args: ["a b"], verbatim: false });
  }
});

test("no secret value or token appeared in any CLI output", async () => {
  const everything = outputs.join("\n");
  const values = [SECRET_A, SECRET_B, SECRET_PROD];
  for (const v of values) {
    assert.ok(!everything.includes(v), `leaked: ${v.slice(0, 8)}...`);
  }
  for (const t of seenTokens) assert.ok(!everything.includes(t), "token leaked");
  assert.ok(seenTokens.size >= 2);
});
