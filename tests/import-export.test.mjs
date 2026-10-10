// Import and export of dotenv files through the real route handlers (over HTTP)
// and a real MongoDB.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_IMPORT_MONGODB_URI ??
  "mongodb://127.0.0.1:27017/keel_import_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");
const { parseDotenv } = await import("../lib/dotenv.ts");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  member: ["member@corp.test"],
  viewer: ["viewer@corp.test"],
  nogrant: ["nogrant@corp.test"],
  outsider: ["outsider@corp.test"],
};

const SENTINEL = "SENTINEL-plaintext-9f3a";
let backend, client, db, P;

const send = async (user, method, path, body, headers = {}) => {
  const res = await fetch(backend.url + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(user ? { "x-test-user": user } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, text, body: json };
};

const imp = (user, env, entries) => {
  resetRateLimits(); // the endpoint is rate limited per user
  return send(user, "POST", `/api/projects/${P}/environments/${env}/import`, { entries });
};
const secretCount = (env) =>
  db.collection("environments").findOne({ projectId: P, slug: env }).then((e) =>
    db.collection("secrets").countDocuments({ environmentId: e._id }),
  );
const value = async (user, env, key) => {
  const list = await send(user, "GET", `/api/projects/${P}/environments/${env}/secrets`);
  const s = list.body.secrets.find((x) => x.key === key);
  if (!s) return null;
  const r = await send(user, "GET", `/api/projects/${P}/environments/${env}/secrets/${s.id}`);
  return r.body.secret.value;
};

const captured = [];
const origError = console.error;
const origLog = console.log;

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();

  P = (await send("owner", "POST", "/api/projects", {
    name: "Import Project",
    environments: ["development", "production"],
  })).body.project.id;

  for (const [user, role] of [["member", "member"], ["viewer", "viewer"], ["nogrant", "member"]]) {
    const inv = await send("owner", "POST", `/api/projects/${P}/invitations`, { email: `${user}@corp.test`, role });
    await send(user, "POST", "/api/invitations/accept", { token: inv.body.devAcceptUrl.split("#")[1] });
  }
  for (const user of ["member", "viewer"])
    await send("owner", "PUT", `/api/projects/${P}/environments/development/access/${user}`);

  await send("owner", "POST", `/api/projects/${P}/environments/development/secrets`, { key: "EXISTING", value: "old-value" });
  await send("owner", "POST", `/api/projects/${P}/environments/production/secrets`, { key: "PROD_KEY", value: "prod-" + SENTINEL });

  console.error = (...a) => captured.push(a.map(String).join(" "));
  console.log = (...a) => captured.push(a.map(String).join(" "));
});
after(async () => {
  console.error = origError;
  console.log = origLog;
  await backend.close();
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

test("import creates secrets: encrypted, versioned, audited", async () => {
  resetRateLimits();
  const r = await imp("member", "development", [
    { key: "NEW_ONE", value: "v1-" + SENTINEL },
    { key: "NEW_TWO", value: 'multi\nline "quoted" # value' },
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.summary, { created: 2, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  assert.deepEqual(r.body.results.map((x) => [x.key, x.status]), [["NEW_ONE", "created"], ["NEW_TWO", "created"]]);
  assert.ok(!r.text.includes(SENTINEL)); // values are never echoed

  assert.equal(await value("member", "development", "NEW_ONE"), "v1-" + SENTINEL);
  assert.equal(await value("member", "development", "NEW_TWO"), 'multi\nline "quoted" # value');

  const docs = await db.collection("secrets").find({ key: { $in: ["NEW_ONE", "NEW_TWO"] } }).toArray();
  assert.ok(!JSON.stringify(docs).includes(SENTINEL));
  assert.ok(docs.every((d) => d.value.v === 1 && d.value.ciphertext && d.value.iv && d.value.tag));

  const versions = await db.collection("secret_versions").find({ secretId: docs[0]._id }).toArray();
  assert.deepEqual(versions.map((v) => [v.versionNumber, v.changeType, v.actorId]), [[1, "CREATED", "member"]]);
  assert.ok(!JSON.stringify(versions).includes(SENTINEL));

  const created = await db.collection("audit_logs").find({ action: "secret.created", "metadata.import": true }).toArray();
  assert.equal(created.length, 2);
  const summary = await db.collection("audit_logs").find({ action: "secrets.imported" }).toArray();
  assert.equal(summary.length, 1);
  assert.deepEqual(
    [summary[0].metadata.total, summary[0].metadata.created, summary[0].metadata.via, summary[0].actorId],
    [2, 2, "web", "member"],
  );
  assert.ok(!JSON.stringify([...created, ...summary]).includes(SENTINEL));
});

test("existing keys: skipped unless overwrite is chosen; overwrites are new versions", async () => {
  const skip = await imp("owner", "development", [{ key: "EXISTING", value: "should-not-apply", overwrite: false }]);
  assert.deepEqual(skip.body.results, [{ key: "EXISTING", status: "skipped" }]);
  assert.equal(await value("owner", "development", "EXISTING"), "old-value");

  const over = await imp("owner", "development", [{ key: "EXISTING", value: "new-value", overwrite: true }]);
  assert.equal(over.body.summary.updated, 1);
  assert.equal(await value("owner", "development", "EXISTING"), "new-value");

  const doc = await db.collection("secrets").findOne({ key: "EXISTING" });
  const versions = await db.collection("secret_versions").find({ secretId: doc._id }).sort({ versionNumber: 1 }).toArray();
  assert.deepEqual(versions.map((v) => [v.versionNumber, v.changeType]), [[1, "CREATED"], [2, "UPDATED"]]);

  // same value again: nothing new is recorded
  const same = await imp("owner", "development", [{ key: "EXISTING", value: "new-value", overwrite: true }]);
  assert.deepEqual(same.body.results, [{ key: "EXISTING", status: "unchanged" }]);
  assert.equal(await db.collection("secret_versions").countDocuments({ secretId: doc._id }), 2);

  const audit = await db.collection("audit_logs").find({ targetId: doc._id, "metadata.import": true }).toArray();
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, "secret.updated");
});

test("invalid input rejects the whole request and writes nothing", async () => {
  const before = await secretCount("development");
  const cases = [
    [{ key: "OK_KEY", value: "fine" }, { key: "1BAD", value: SENTINEL }],
    [{ key: "OK_KEY", value: "fine" }, { key: "EMPTY", value: "" }],
    [{ key: "OK_KEY", value: "fine" }, { key: "OK_KEY", value: "dup" }],
    [{ key: "OK_KEY", value: "x".repeat(10_001) }],
    [{ key: "OK_KEY" }],
    ["not an object"],
  ];
  for (const entries of cases) {
    const r = await imp("owner", "development", entries);
    assert.equal(r.status, 400, JSON.stringify(entries).slice(0, 60));
    assert.ok(!r.text.includes(SENTINEL));
  }
  assert.equal((await send("owner", "POST", `/api/projects/${P}/environments/development/import`, { entries: [] })).status, 400);
  assert.equal((await send("owner", "POST", `/api/projects/${P}/environments/development/import`, { entries: "x" })).status, 400);
  const tooMany = Array.from({ length: 501 }, (_, i) => ({ key: `K${i}`, value: "v" }));
  assert.equal((await imp("owner", "development", tooMany)).status, 400);
  assert.equal(await secretCount("development"), before);
});

test("unauthorized imports are refused before anything is written", async () => {
  const before = await secretCount("development");
  const entries = [{ key: "BLOCKED", value: SENTINEL }];

  assert.equal((await imp("viewer", "development", entries)).status, 403);
  assert.equal((await imp("nogrant", "development", entries)).status, 403);
  assert.equal((await imp("member", "production", entries)).status, 403); // no production grant
  assert.equal((await imp("outsider", "development", entries)).status, 404);
  assert.equal((await imp(null, "development", entries)).status, 401);

  // a CLI token cannot import (browser sessions only)
  const dev = await send(null, "POST", "/api/cli/auth/device", {});
  await send("owner", "POST", "/api/cli/auth/approve", { userCode: dev.body.userCode });
  const tok = await send(null, "POST", "/api/cli/auth/token", { deviceCode: dev.body.deviceCode });
  const viaCli = await send(null, "POST", `/api/projects/${P}/environments/development/import`, { entries }, {
    authorization: `Bearer ${tok.body.accessToken}`,
  });
  assert.equal(viaCli.status, 403);

  assert.equal(await secretCount("development"), before);
  assert.equal(await secretCount("production"), 1);
});

test("members (who hold update permission) can overwrite", async () => {
  const ok = await imp("member", "development", [{ key: "EXISTING", value: "by-member", overwrite: true }]);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.summary.updated, 1);
});

test("a failing entry is reported, the rest are saved", async () => {
  // A conflicting record that import cannot see (other project id) makes the
  // unique (environment, key) index reject exactly one entry.
  const env = await db.collection("environments").findOne({ projectId: P, slug: "development" });
  await db.collection("secrets").insertOne({
    _id: "ghost-1",
    projectId: "some-other-project",
    environmentId: env._id,
    key: "CONFLICT_KEY",
    value: { v: 1, ciphertext: "AA", iv: "AA", tag: "AA" },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const r = await imp("owner", "development", [
    { key: "BEFORE", value: "1" },
    { key: "CONFLICT_KEY", value: SENTINEL },
    { key: "AFTER", value: "3" },
  ]);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.summary, { created: 2, updated: 0, unchanged: 0, skipped: 0, failed: 1 });
  const failed = r.body.results.find((x) => x.status === "failed");
  assert.equal(failed.key, "CONFLICT_KEY");
  assert.ok(!r.text.includes(SENTINEL));
  assert.equal(await value("owner", "development", "BEFORE"), "1");
  assert.equal(await value("owner", "development", "AFTER"), "3");

  const summary = await db.collection("audit_logs").find({ action: "secrets.imported" }).sort({ at: -1 }).limit(1).toArray();
  assert.equal(summary[0].metadata.failed, 1);
  await db.collection("secrets").deleteOne({ _id: "ghost-1" });
});

test("export as dotenv: authorized, escaped, audited, not cached", async () => {
  await imp("owner", "development", [
    { key: "SPECIAL", value: 'has "quotes", spaces\nand a newline # and hash' },
    { key: "BACKSLASH", value: "C:\\path\\to\\file" },
    { key: "SIMPLE", value: "plain" },
  ]);

  const r = await send("viewer", "GET", `/api/projects/${P}/environments/development/export?format=dotenv`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/plain/);
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename=".env.development"');
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");

  const parsed = parseDotenv(r.text);
  assert.deepEqual(parsed.problems, []);
  const map = Object.fromEntries(parsed.entries.map((e) => [e.key, e.value]));
  assert.equal(map.SPECIAL, 'has "quotes", spaces\nand a newline # and hash');
  assert.equal(map.BACKSLASH, "C:\\path\\to\\file");
  assert.equal(map.SIMPLE, "plain");
  assert.ok(!("PROD_KEY" in map)); // other environments never included
  assert.ok(!r.text.includes("prod-" + SENTINEL));

  const audit = await db.collection("audit_logs").find({ action: "secrets.exported", "metadata.format": "dotenv" }).toArray();
  assert.ok(audit.length >= 1);
  assert.ok(!JSON.stringify(audit).includes("quotes"));
});

test("export respects environment access and roles", async () => {
  const url = (env) => `/api/projects/${P}/environments/${env}/export?format=dotenv`;
  const owner = await send("owner", "GET", url("production"));
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get("content-disposition"), 'attachment; filename=".env.production"');
  assert.match(owner.text, /^PROD_KEY=/m);

  for (const [user, status] of [["member", 403], ["viewer", 403], ["nogrant", 403], ["outsider", 404], [null, 401]]) {
    const r = await send(user, "GET", url("production"));
    assert.equal(r.status, status, String(user));
    assert.ok(!r.text.includes(SENTINEL));
  }
  assert.equal((await send("nogrant", "GET", url("development"))).status, 403);
  assert.equal((await send("member", "GET", url("staging"))).status, 404);
});

test("no secret value reached the server logs", async () => {
  const all = captured.join("\n");
  assert.ok(!all.includes(SENTINEL));
  assert.ok(!all.includes("old-value") && !all.includes("new-value"));
});
