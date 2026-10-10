// Vercel integration tests. The Vercel API is mocked; nothing here has touched a
// real Vercel account. Keel's own handlers and MongoDB are real.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_VERCEL_MONGODB_URI ?? "mongodb://127.0.0.1:27017/keel_vercel_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.VERCEL_RETRY_DELAY_MS = "5";
process.env.KEEL_SYNC_DEBOUNCE_MS = "80";

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  admin: ["admin@corp.test"],
  member: ["member@corp.test"],
  outsider: ["outsider@corp.test"],
};

const TOKEN = "vcp_SECRET_TOKEN_" + randomBytes(12).toString("hex");
const HOOK = "https://api.vercel.com/v1/integrations/deploy/prj_abc123/HOOKSECRET" + randomBytes(6).toString("hex");
const SENTINEL = "SENTINEL-vercel-value";

// ---- mock Vercel ----------------------------------------------------------
const realFetch = globalThis.fetch;
const vercel = {
  projects: [
    { id: "prj_abc123", name: "web-app" },
    { id: "prj_def456", name: "docs" },
  ],
  envs: [],
  values: {},
  deployments: [],
  calls: [],
  hookCalls: 0,
  fail: [],
};
const resetVercel = () => {
  vercel.envs = [];
  vercel.values = {};
  vercel.deployments = [];
  vercel.calls = [];
  vercel.hookCalls = 0;
  vercel.fail = [];
};
const mutating = () => vercel.calls.filter((c) => c.method !== "GET" && !c.path.includes("/deploy/"));

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? String(input)));
  if (url.host !== "api.vercel.com") return realFetch(input, init);

  const method = (init.method ?? "GET").toUpperCase();
  const path = url.pathname;
  const body = init.body ? JSON.parse(init.body) : undefined;
  const auth = new Headers(init.headers ?? {}).get("authorization");
  vercel.calls.push({ method, path, query: Object.fromEntries(url.searchParams), body });
  const reply = (status, data = {}) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  for (const f of vercel.fail) {
    if (f.times > 0 && f.match({ method, path, body })) {
      f.times--;
      return reply(f.status, { error: { code: "mock", message: `LEAK-${TOKEN}-${SENTINEL}` } });
    }
  }

  if (path.startsWith("/v1/integrations/deploy/")) {
    vercel.hookCalls++;
    vercel.deployments.push({ uid: `dpl_${vercel.hookCalls}`, url: `web-app-${vercel.hookCalls}.vercel.app`, readyState: "READY", created: Date.now() });
    return reply(201, { job: { id: `job_${vercel.hookCalls}`, state: "PENDING", createdAt: Date.now() } });
  }

  if (auth !== `Bearer ${TOKEN}`) return reply(401, { error: { code: "forbidden" } });

  if (method === "GET" && path === "/v2/user") return reply(200, { user: { username: "keel-tester" } });
  if (method === "GET" && path === "/v2/teams")
    return reply(200, { teams: [{ id: "team_one", name: "Team One" }], pagination: {} });
  if (method === "GET" && path === "/v9/projects") {
    const until = Number(url.searchParams.get("until") ?? 0);
    const page = until ? [vercel.projects[1]] : [vercel.projects[0]];
    return reply(200, { projects: page, pagination: until ? {} : { next: 111 } });
  }
  const proj = /^\/v9\/projects\/([^/]+)$/.exec(path);
  if (method === "GET" && proj) {
    const p = vercel.projects.find((x) => x.id === proj[1]);
    return p ? reply(200, p) : reply(404, {});
  }
  if (method === "GET" && /^\/v10\/projects\/[^/]+\/env$/.test(path))
    return reply(200, { envs: vercel.envs.map(({ id, key, target, gitBranch }) => ({ id, key, target, gitBranch })) });
  if (method === "POST" && /^\/v10\/projects\/[^/]+\/env$/.test(path)) {
    const clash = vercel.envs.find((e) => e.key === body.key && e.target.some((t) => body.target.includes(t)));
    if (clash) return reply(409, {});
    const id = `env_${randomUUID().slice(0, 8)}`;
    vercel.envs.push({ id, key: body.key, target: body.target, gitBranch: null });
    vercel.values[id] = body.value;
    return reply(201, { created: { id, key: body.key, target: body.target }, failed: [] });
  }
  const one = /^\/v9\/projects\/[^/]+\/env\/([^/]+)$/.exec(path);
  if (one && method === "PATCH") {
    if (!vercel.values[one[1]] && !vercel.envs.some((e) => e.id === one[1])) return reply(404, {});
    vercel.values[one[1]] = body.value;
    return reply(200, {});
  }
  if (one && method === "DELETE") {
    const i = vercel.envs.findIndex((e) => e.id === one[1]);
    if (i === -1) return reply(404, {});
    vercel.envs.splice(i, 1);
    delete vercel.values[one[1]];
    return reply(200, {});
  }
  if (method === "GET" && path === "/v6/deployments") return reply(200, { deployments: vercel.deployments });
  return reply(404, {});
};

// ---- harness ------------------------------------------------------------------
let backend, client, db, P;
const captured = [];
const origError = console.error;
const origLog = console.log;

const send = async (user, method, path, body, headers = {}) => {
  const res = await fetch(backend.url + path, {
    method,
    headers: { "content-type": "application/json", ...(user ? { "x-test-user": user } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, text, body: json };
};
const integ = (user, method = "GET", body) => send(user, method, `/api/projects/${P}/integrations/vercel`, body);
const sync = (user, redeploy = false) =>
  send(user, "POST", `/api/projects/${P}/integrations/vercel/sync`, { redeploy });
const secretsUrl = (env) => `/api/projects/${P}/environments/${env}/secrets`;
const setSecret = async (env, key, value, user = "owner") => {
  const list = await send(user, "GET", secretsUrl(env));
  const found = list.body.secrets.find((s) => s.key === key);
  if (found) return send(user, "PATCH", `${secretsUrl(env)}/${found.id}`, { value });
  return send(user, "POST", secretsUrl(env), { key, value });
};
const delSecret = async (env, key) => {
  const list = await send("owner", "GET", secretsUrl(env));
  const s = list.body.secrets.find((x) => x.key === key);
  return send("owner", "DELETE", `${secretsUrl(env)}/${s.id}`);
};
const waitFor = async (fn, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 40));
  }
  return false;
};
/** Waits for debounced automatic syncs to finish. */
const settle = async () => {
  await new Promise((r) => setTimeout(r, 250));
  await waitFor(async () => {
    const i = await db.collection("integrations").findOne({});
    return !i || (!i.lockUntil && !(i.pendingEnvs?.length));
  });
};
const envFor = (key, target) => vercel.envs.find((e) => e.key === key && e.target.includes(target));
const MAPPINGS = { development: "development", staging: "preview", production: "production" };
const configure = (extra = {}) =>
  integ("owner", "PUT", {
    vercelProjectId: "prj_abc123",
    mappings: MAPPINGS,
    autoRedeploy: false,
    conflictPolicy: "skip",
    ...extra,
  });

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();

  P = (await send("owner", "POST", "/api/projects", {
    name: "Vercel Project",
    environments: ["development", "staging", "production"],
  })).body.project.id;
  for (const [user, role] of [["admin", "admin"], ["member", "member"]]) {
    const inv = await send("owner", "POST", `/api/projects/${P}/invitations`, { email: `${user}@corp.test`, role });
    await send(user, "POST", "/api/invitations/accept", { token: inv.body.devAcceptUrl.split("#")[1] });
  }
  await send("owner", "PUT", `/api/projects/${P}/environments/development/access/member`);

  console.error = (...a) => captured.push(a.map(String).join(" "));
  console.log = (...a) => captured.push(a.map(String).join(" "));
});
beforeEach(() => resetRateLimits());
after(async () => {
  console.error = origError;
  console.log = origLog;
  globalThis.fetch = realFetch;
  await backend.close();
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

// ---- tests -----------------------------------------------------------------------
test("connect validates the token and never exposes or stores it in plaintext", async () => {
  const bad = await integ("owner", "POST", { token: "vcp_definitely_wrong_token" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /rejected the access token/);
  assert.ok(!bad.text.includes("definitely_wrong"));
  assert.equal(await db.collection("integrations").countDocuments(), 0);

  const ok = await integ("owner", "POST", { token: TOKEN });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.connected, true);
  assert.equal(ok.body.status, "connected");
  assert.ok(!ok.text.includes(TOKEN));

  const doc = await db.collection("integrations").findOne({});
  assert.ok(!JSON.stringify(doc).includes(TOKEN));
  assert.ok(doc.tokenEnc.ciphertext && doc.tokenEnc.iv && doc.tokenEnc.tag && doc.tokenEnc.v === 1);

  const status = await integ("owner");
  assert.ok(!status.text.includes(TOKEN));
  assert.ok(!/tokenEnc|ciphertext/.test(status.text));
});

test("only owners and admins can manage the integration, browser only", async () => {
  assert.equal((await integ("admin")).status, 200);
  assert.equal((await integ("member")).status, 403);
  assert.equal((await integ("outsider")).status, 404);
  assert.equal((await integ(null)).status, 401);
  assert.equal((await integ("member", "POST", { token: TOKEN })).status, 403);
  assert.equal((await integ("member", "DELETE")).status, 403);
  assert.equal((await sync("member")).status, 403);

  const dev = await send(null, "POST", "/api/cli/auth/device", {});
  await send("owner", "POST", "/api/cli/auth/approve", { userCode: dev.body.userCode });
  const tok = await send(null, "POST", "/api/cli/auth/token", { deviceCode: dev.body.deviceCode });
  const viaCli = await send(null, "GET", `/api/projects/${P}/integrations/vercel`, undefined, {
    authorization: `Bearer ${tok.body.accessToken}`,
  });
  assert.equal(viaCli.status, 403);
});

test("projects and teams are fetched server side across pages", async () => {
  resetVercel();
  const r = await send("owner", "GET", `/api/projects/${P}/integrations/vercel/options`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.projects.map((p) => p.name), ["web-app", "docs"]);
  assert.deepEqual(r.body.teams, [{ id: "team_one", name: "Team One" }]);
  assert.ok(!r.text.includes(TOKEN));
  assert.equal((await send("owner", "GET", `/api/projects/${P}/integrations/vercel/options?teamId=nope`)).status, 400);
});

test("configuration is validated on the server", async () => {
  resetVercel();
  const base = { vercelProjectId: "prj_abc123", mappings: MAPPINGS, autoRedeploy: false };
  const cases = [
    [{ ...base, vercelProjectId: "web-app" }, "project id format"],
    [{ ...base, vercelProjectId: "prj_missing" }, "unknown project"],
    [{ ...base, mappings: { nope: "production" } }, "unknown environment"],
    [{ ...base, mappings: { development: "staging" } }, "bad target"],
    [{ ...base, mappings: { development: "production", staging: "production" } }, "two onto one target"],
    [{ ...base, mappings: {} }, "no mappings"],
    [{ ...base, autoRedeploy: true }, "auto redeploy without a hook"],
    [{ ...base, deployHookUrl: "https://evil.example/v1/integrations/deploy/x" }, "foreign hook host"],
    [{ ...base, deployHookUrl: "http://api.vercel.com/v1/integrations/deploy/x" }, "http hook"],
    [{ ...base, deployHookUrl: "https://api.vercel.com/v2/user" }, "wrong hook path"],
  ];
  for (const [body, why] of cases) {
    const r = await integ("owner", "PUT", body);
    assert.equal(r.status, 400, why);
  }
  assert.equal((await integ("member", "PUT", base)).status, 403);
});

test("a valid configuration is saved; the deploy hook is encrypted and never returned", async () => {
  const r = await configure({ deployHookUrl: HOOK, autoRedeploy: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "active");
  assert.equal(r.body.vercelProjectName, "web-app");
  assert.equal(r.body.hookConfigured, true);
  assert.deepEqual(r.body.mappings, MAPPINGS);
  assert.ok(!r.text.includes("HOOKSECRET"));
  const doc = await db.collection("integrations").findOne({});
  assert.ok(!JSON.stringify(doc).includes("HOOKSECRET"));
  assert.ok(doc.hookEnc.ciphertext);
});

test("manual sync creates variables on the mapped targets, special characters intact", async () => {
  resetVercel();
  const multiline = '-----BEGIN KEY-----\nabc"def\\ghi\n-----END KEY-----\n# not a comment $VAR ${OTHER} 🔐';
  await setSecret("development", "DEV_ONLY", "dev-value-" + SENTINEL);
  await setSecret("staging", "SHARED", "staging-value");
  await setSecret("production", "SHARED", "production-value");
  await setSecret("production", "PRIVATE_KEY", multiline);

  const r = await sync("owner");
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.summary.status, "success");
  assert.equal(r.body.summary.created, 4);

  assert.equal(vercel.values[envFor("DEV_ONLY", "development").id], "dev-value-" + SENTINEL);
  assert.equal(vercel.values[envFor("SHARED", "preview").id], "staging-value");
  assert.equal(vercel.values[envFor("SHARED", "production").id], "production-value");
  assert.equal(vercel.values[envFor("PRIVATE_KEY", "production").id], multiline);
  // separate variables per target, no duplicates, one target each
  assert.equal(vercel.envs.filter((e) => e.key === "SHARED").length, 2);
  assert.ok(vercel.envs.every((e) => e.target.length === 1));
  // created as encrypted variables
  const creates = vercel.calls.filter((c) => c.method === "POST" && c.path.endsWith("/env"));
  assert.ok(creates.every((c) => c.body.type === "encrypted"));
});

test("a second sync is idempotent", async () => {
  vercel.calls = [];
  const r = await sync("owner");
  assert.equal(r.body.summary.status, "success");
  assert.deepEqual(
    [r.body.summary.created, r.body.summary.updated, r.body.summary.deleted, r.body.summary.unchanged],
    [0, 0, 0, 4],
  );
  assert.equal(mutating().length, 0);
});

test("secret changes sync automatically: update, rename and delete", async () => {
  const before = vercel.envs.length;
  await setSecret("production", "SHARED", "production-value-2");
  assert.ok(await waitFor(() => vercel.values[envFor("SHARED", "production")?.id] === "production-value-2"));
  assert.equal(vercel.envs.length, before); // updated in place, no duplicate

  const doc = await db.collection("secrets").findOne({ key: "DEV_ONLY" });
  await send("owner", "PATCH", `${secretsUrl("development")}/${doc._id}`, { key: "DEV_RENAMED" });
  assert.ok(await waitFor(() => envFor("DEV_RENAMED", "development") && !envFor("DEV_ONLY", "development")));

  await delSecret("development", "DEV_RENAMED");
  assert.ok(await waitFor(() => !envFor("DEV_RENAMED", "development")));
  assert.equal(await db.collection("integration_vars").countDocuments({ key: "DEV_RENAMED" }), 0);
});

test("a variable deleted in Vercel is recreated; Keel is the source of truth", async () => {
  await settle();
  const gone = envFor("PRIVATE_KEY", "production");
  vercel.envs = vercel.envs.filter((e) => e.id !== gone.id);
  const r = await sync("owner");
  assert.equal(r.body.summary.created, 1);
  assert.ok(envFor("PRIVATE_KEY", "production"));
});

test("conflicts: variables Keel does not own are never overwritten by default", async () => {
  await settle();
  resetVercel();
  await db.collection("integration_vars").deleteMany({});
  // user-managed variables created outside Keel
  vercel.envs.push({ id: "env_user1", key: "SHARED", target: ["production"], gitBranch: null });
  vercel.values.env_user1 = "hand-made";
  vercel.envs.push({ id: "env_user2", key: "PRIVATE_KEY", target: ["production", "preview"], gitBranch: null });
  vercel.values.env_user2 = "hand-made-shared";

  const r = await sync("owner");
  assert.equal(r.body.summary.status, "partial");
  assert.deepEqual(r.body.summary.conflicts.sort(), ["PRIVATE_KEY", "SHARED"]);
  assert.equal(vercel.values.env_user1, "hand-made");
  assert.equal(vercel.values.env_user2, "hand-made-shared");

  // overwrite policy takes over an exclusive variable, but never one that is
  // shared with another target
  await configure({ conflictPolicy: "overwrite" });
  const r2 = await sync("owner");
  assert.equal(vercel.values.env_user1, "production-value-2");
  assert.deepEqual(r2.body.summary.conflicts, ["PRIVATE_KEY"]);
  assert.equal(vercel.values.env_user2, "hand-made-shared");

  // once adopted, Keel owns it and keeps it in step
  await setSecret("production", "SHARED", "production-value-3");
  assert.ok(await waitFor(() => vercel.values.env_user1 === "production-value-3"));
  await configure({ conflictPolicy: "skip" });
});

test("transient Vercel errors are retried; permanent ones are not", async () => {
  await settle();
  resetVercel();
  await db.collection("integration_vars").deleteMany({});
  const keys = (await db.collection("secrets").find({}).toArray()).length;

  // two 500s then success
  vercel.fail.push({ match: (c) => c.method === "GET" && c.path.endsWith("/env"), status: 500, times: 2 });
  const ok = await sync("owner");
  assert.equal(ok.body.summary.status, "success");
  assert.equal(ok.body.summary.created, keys);
  assert.equal(vercel.calls.filter((c) => c.method === "GET" && c.path.endsWith("/env")).length, 3);

  // 429 is retried too
  vercel.calls = [];
  vercel.fail.push({ match: (c) => c.method === "GET" && c.path.endsWith("/env"), status: 429, times: 1 });
  assert.equal((await sync("owner")).body.summary.status, "success");
  assert.equal(vercel.calls.filter((c) => c.method === "GET" && c.path.endsWith("/env")).length, 2);
});

test("one failing variable is reported without losing the rest, and nothing is redeployed", async () => {
  resetVercel();
  await db.collection("integration_vars").deleteMany({});
  await configure({ deployHookUrl: HOOK, autoRedeploy: true });
  vercel.fail.push({ match: (c) => c.method === "POST" && c.body?.key === "PRIVATE_KEY", status: 400, times: 99 });

  const r = await sync("owner", true);
  assert.equal(r.body.summary.status, "partial");
  assert.deepEqual(r.body.summary.failed, ["PRIVATE_KEY"]);
  assert.ok(r.body.summary.created >= 2);
  assert.equal(vercel.hookCalls, 0);
  assert.equal(r.body.summary.deployment, "skipped");
  assert.ok(!r.text.includes(SENTINEL) && !r.text.includes(TOKEN));

  const st = await integ("owner");
  assert.equal(st.body.lastSyncStatus, "partial");
  assert.match(st.body.lastError, /could not be synced/);
  assert.ok(!st.text.includes("LEAK"));
});

test("bad credentials stop the sync, are not retried, and flag the integration", async () => {
  resetVercel();
  vercel.fail.push({ match: (c) => c.method === "GET" && c.path.endsWith("/env"), status: 403, times: 99 });
  const r = await sync("owner");
  assert.equal(r.status, 200);
  assert.equal(r.body.summary.status, "failed");
  assert.match(r.body.summary.error, /permission/);
  assert.equal(vercel.calls.filter((c) => c.path.endsWith("/env") && c.method === "GET").length, 1); // no retry
  assert.ok(!r.text.includes("LEAK"));

  const st = await integ("owner");
  assert.equal(st.body.status, "attention");
  assert.equal((await sync("owner")).status, 400);
  assert.ok(!st.text.includes("LEAK") && !st.text.includes(TOKEN));

  // reconnecting restores it
  resetVercel();
  assert.equal((await integ("owner", "POST", { token: TOKEN })).status, 201);
  assert.equal((await integ("owner")).body.status, "active");
});

test("rapid changes are batched into a single sync and a single redeploy", async () => {
  resetVercel();
  await db.collection("integration_vars").deleteMany({});
  await configure({ deployHookUrl: HOOK, autoRedeploy: true });
  await sync("owner"); // settle
  vercel.hookCalls = 0;
  vercel.calls = [];

  for (let i = 0; i < 5; i++) await setSecret("production", "BURST", `v${i}`);
  assert.ok(await waitFor(() => vercel.hookCalls >= 1));
  await new Promise((r) => setTimeout(r, 400)); // nothing else should follow
  assert.equal(vercel.hookCalls, 1);
  assert.equal(vercel.values[envFor("BURST", "production").id], "v4");

  // the deploy came after the variable writes
  const order = vercel.calls.map((c) => (c.path.includes("/deploy/") ? "deploy" : c.method));
  assert.ok(order.lastIndexOf("POST") < order.indexOf("deploy") || order.lastIndexOf("PATCH") < order.indexOf("deploy"));
});

test("deployment is tracked and shown", async () => {
  const st = await integ("owner");
  assert.equal(st.body.lastDeployment.state, "READY");
  assert.match(st.body.lastDeployment.url, /^https:\/\/web-app-\d+\.vercel\.app$/);
  assert.ok(!st.text.includes("HOOKSECRET"));
});

test("manual Sync & Redeploy deploys once; a concurrent sync is refused", async () => {
  resetVercel();
  vercel.hookCalls = 0;
  const [a, b] = await Promise.all([sync("owner", true), sync("admin", true)]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  assert.equal(vercel.hookCalls, 1);
  assert.equal(vercel.envs.length, new Set(vercel.envs.map((e) => `${e.key}:${e.target}`)).size);
});

test("redeploy without a hook is skipped with a reason", async () => {
  await configure({ deployHookUrl: null, autoRedeploy: false });
  const r = await sync("owner", true);
  assert.equal(r.body.summary.deployment, "skipped", JSON.stringify(r.body.summary));
  assert.match(r.body.summary.deploymentReason, /deploy hook/, JSON.stringify(r.body.summary));
  await configure({ deployHookUrl: HOOK });
});

test("a Vercel outage never blocks or breaks secret changes", async () => {
  resetVercel();
  vercel.fail.push({ match: () => true, status: 500, times: 9999 });
  const r = await setSecret("production", "WHILE_DOWN", "still-saved");
  assert.equal(r.status, 201);
  const list = await send("owner", "GET", secretsUrl("production"));
  assert.ok(list.body.secrets.some((s) => s.key === "WHILE_DOWN"));
  // import and rollback paths also keep working
  const imp = await send("owner", "POST", `/api/projects/${P}/environments/production/import`, {
    entries: [{ key: "IMPORTED_DOWN", value: "x" }],
  });
  assert.equal(imp.status, 200);
  await waitFor(async () => (await integ("owner")).body.lastSyncStatus === "failed", 4000);
  vercel.fail = [];
});

test("audit records connection, sync and deploy without values or tokens", async () => {
  const logs = await db.collection("audit_logs").find({ action: /^integration\./ }).toArray();
  const actions = new Set(logs.map((l) => l.action));
  for (const a of ["integration.connected", "integration.updated", "integration.synced", "integration.deploy_triggered"])
    assert.ok(actions.has(a), a);
  const synced = logs.find((l) => l.action === "integration.synced");
  assert.equal(typeof synced.metadata.created, "number");
  const text = JSON.stringify(logs);
  assert.ok(!text.includes(TOKEN) && !text.includes("HOOKSECRET") && !text.includes(SENTINEL));
  assert.ok(!text.includes("production-value"));
});

test("disconnect removes Keel's records, leaves Vercel variables, and stops syncing", async () => {
  await settle(); // let any queued automatic sync from earlier tests finish first
  resetVercel();
  vercel.envs.push({ id: "env_keep", key: "KEEP", target: ["production"], gitBranch: null });
  const r = await integ("owner", "DELETE");
  assert.equal(r.status, 200);
  assert.deepEqual((await integ("owner")).body, { connected: false });
  assert.equal(await db.collection("integration_vars").countDocuments(), 0);
  assert.ok(vercel.envs.some((e) => e.id === "env_keep"));

  vercel.calls = [];
  await setSecret("production", "AFTER_DISCONNECT", "x");
  await new Promise((res) => setTimeout(res, 300));
  assert.equal(vercel.calls.length, 0);
  assert.ok((await db.collection("audit_logs").find({ action: "integration.disconnected" }).toArray()).length >= 1);
});

test("project deletion removes the integration", async () => {
  assert.equal((await integ("owner", "POST", { token: TOKEN })).status, 201);
  assert.equal(await db.collection("integrations").countDocuments({ projectId: P }), 1);
  assert.equal((await send("owner", "DELETE", `/api/projects/${P}`)).status, 200);
  assert.equal(await db.collection("integrations").countDocuments({ projectId: P }), 0);
});

test("no token, hook secret or secret value reached the logs", async () => {
  const all = captured.join("\n");
  assert.ok(!all.includes(TOKEN));
  assert.ok(!all.includes("HOOKSECRET"));
  assert.ok(!all.includes(SENTINEL));
});
