// Server side of the CLI: device login, tokens, scoping, authorization parity,
// audit, and rate limits. Real route handlers and a real MongoDB, over HTTP.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_CLIAPI_MONGODB_URI ??
  "mongodb://127.0.0.1:27017/keel_cliapi_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  member: ["member@corp.test"],
  viewer: ["viewer@corp.test"],
  nogrant: ["nogrant@corp.test"],
  outsider: ["outsider@corp.test"],
};

let backend, client, db;
let P;
const SECRET_VALUES = { development: "dev-secret-value", production: "PROD-secret-value" };

const web = async (user, method, path, body) => {
  const res = await fetch(backend.url + path, {
    method,
    headers: { "content-type": "application/json", "x-test-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const cli = async (token, method, path, body, extra = {}) => {
  const res = await fetch(backend.url + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const pub = (path, body) => cli(null, "POST", path, body);

/** Full device flow for a user. Returns the issued credentials. */
async function login(user) {
  resetRateLimits(); // the device endpoint is limited per address
  const start = await pub("/api/cli/auth/device", { deviceName: "test box" });
  assert.equal(start.status, 200);
  const approve = await web(user, "POST", "/api/cli/auth/approve", { userCode: start.body.userCode });
  assert.equal(approve.status, 200);
  const done = await pub("/api/cli/auth/token", { deviceCode: start.body.deviceCode });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, "approved");
  return done.body;
}

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();

  const p = await web("owner", "POST", "/api/projects", {
    name: "CLI Project",
    environments: ["development", "production"],
  });
  P = p.body.project.id;

  for (const [user, role] of [["member", "member"], ["viewer", "viewer"], ["nogrant", "member"]]) {
    const inv = await web("owner", "POST", `/api/projects/${P}/invitations`, { email: `${user}@corp.test`, role });
    const token = inv.body.devAcceptUrl.split("#")[1];
    const acc = await web(user, "POST", "/api/invitations/accept", { token });
    assert.equal(acc.status, 200);
  }
  for (const user of ["member", "viewer"])
    await web("owner", "PUT", `/api/projects/${P}/environments/development/access/${user}`);

  for (const env of ["development", "production"]) {
    const r = await web("owner", "POST", `/api/projects/${P}/environments/${env}/secrets`, {
      key: "API_KEY",
      value: SECRET_VALUES[env],
    });
    assert.equal(r.status, 201);
  }
});
after(async () => {
  await backend.close();
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

test("device login: pending, approved once, tokens stored only as hashes", async () => {
  resetRateLimits();
  const start = await pub("/api/cli/auth/device", { deviceName: "laptop" });
  assert.match(start.body.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(start.body.deviceCode.length >= 40);
  assert.ok(start.body.verificationUrl.includes(start.body.userCode));

  assert.equal((await pub("/api/cli/auth/token", { deviceCode: start.body.deviceCode })).status, 202);

  // Approval needs a browser session; a bearer-less anonymous call is refused.
  const anon = await pub("/api/cli/auth/approve", { userCode: start.body.userCode });
  assert.equal(anon.status, 401);
  assert.equal((await web("owner", "POST", "/api/cli/auth/approve", { userCode: "ZZZZ-ZZZZ" })).status, 404);
  assert.equal((await web("owner", "POST", "/api/cli/auth/approve", { userCode: start.body.userCode.toLowerCase() })).status, 200);

  const done = await pub("/api/cli/auth/token", { deviceCode: start.body.deviceCode });
  assert.equal(done.status, 200);
  assert.match(done.body.accessToken, /^keel_at_/);
  assert.match(done.body.refreshToken, /^keel_rt_/);
  assert.equal(done.body.email, "owner@corp.test");

  // single use
  assert.equal((await pub("/api/cli/auth/token", { deviceCode: start.body.deviceCode })).status, 400);

  const raw = JSON.stringify(await db.collection("cli_sessions").find({}).toArray()) +
    JSON.stringify(await db.collection("cli_device_requests").find({}).toArray());
  assert.ok(!raw.includes(done.body.accessToken));
  assert.ok(!raw.includes(done.body.refreshToken));
  assert.ok(!raw.includes(start.body.deviceCode));
});

test("denied and expired device requests never produce credentials", async () => {
  const a = await pub("/api/cli/auth/device", {});
  await web("owner", "POST", "/api/cli/auth/approve", { userCode: a.body.userCode, approve: false });
  const denied = await pub("/api/cli/auth/token", { deviceCode: a.body.deviceCode });
  assert.equal(denied.status, 400);
  assert.equal(denied.body.status, "denied");
  assert.equal(denied.body.accessToken, undefined);

  const b = await pub("/api/cli/auth/device", {});
  await db.collection("cli_device_requests").updateOne(
    { userCode: b.body.userCode },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await web("owner", "POST", "/api/cli/auth/approve", { userCode: b.body.userCode })).status, 404);
  assert.equal((await pub("/api/cli/auth/token", { deviceCode: b.body.deviceCode })).body.status, "expired");
  assert.equal((await pub("/api/cli/auth/token", { deviceCode: "x".repeat(10) })).status, 400);
});

test("CLI tokens only work on opted-in routes", async () => {
  const { accessToken } = await login("owner");
  assert.equal((await cli(accessToken, "GET", "/api/projects")).status, 200);
  assert.equal((await cli(accessToken, "GET", `/api/projects/${P}`)).status, 200);

  // everything else is refused outright, even for the project owner
  for (const [method, path, body] of [
    ["POST", "/api/projects", { name: "x", environments: ["development"] }],
    ["DELETE", `/api/projects/${P}`],
    ["GET", `/api/projects/${P}/members`],
    ["POST", `/api/projects/${P}/invitations`, { email: "a@b.co", role: "viewer" }],
    ["PUT", `/api/projects/${P}/environments/development/access/viewer`],
    ["POST", "/api/cli/auth/approve", { userCode: "ABCD-EFGH" }],
    ["DELETE", "/api/cli/sessions"],
  ]) {
    const r = await cli(accessToken, method, path, body);
    assert.equal(r.status, 403, `${method} ${path}`);
  }
  // a bad token is 401, and does not fall back to anything else
  assert.equal((await cli("keel_at_nope", "GET", "/api/projects")).status, 401);
});

test("authorization parity: same RBAC and environment rules as the web app", async () => {
  const owner = (await login("owner")).accessToken;
  const member = (await login("member")).accessToken;
  const viewer = (await login("viewer")).accessToken;
  const nogrant = (await login("nogrant")).accessToken;
  const outsider = (await login("outsider")).accessToken;
  const dev = `/api/projects/${P}/environments/development`;
  const prod = `/api/projects/${P}/environments/production`;

  // projects: only those the user belongs to, only authorized environments
  const mine = (t) => cli(t, "GET", "/api/projects").then((r) => r.body.projects);
  assert.deepEqual((await mine(member)).find((p) => p.id === P).environments, ["development"]);
  assert.deepEqual((await mine(nogrant)).find((p) => p.id === P).environments, []);
  assert.equal((await mine(outsider)).length, 0);

  // export: member+grant ok, production denied, no grant denied, outsider 404
  assert.equal((await cli(member, "GET", `${dev}/export`)).status, 200);
  assert.equal((await cli(member, "GET", `${prod}/export`)).status, 403);
  assert.equal((await cli(nogrant, "GET", `${dev}/export`)).status, 403);
  assert.equal((await cli(outsider, "GET", `${dev}/export`)).status, 404);
  const ex = await cli(owner, "GET", `${prod}/export`);
  assert.deepEqual(ex.body.secrets, [{ key: "API_KEY", value: SECRET_VALUES.production }]);

  // list/create/update follow role + environment
  assert.equal((await cli(viewer, "GET", `${dev}/secrets`)).status, 200);
  assert.equal((await cli(viewer, "POST", `${dev}/secrets`, { key: "V", value: "x" })).status, 403);
  assert.equal((await cli(nogrant, "GET", `${dev}/secrets`)).status, 403);
  assert.equal((await cli(member, "GET", `${prod}/secrets`)).status, 403);
  assert.equal((await cli(outsider, "POST", `${dev}/secrets`, { key: "V", value: "x" })).status, 404);

  // viewer can export (read) but never write
  const vex = await cli(viewer, "GET", `${dev}/export`);
  assert.equal(vex.status, 200);
  assert.equal(vex.body.secrets[0].value, SECRET_VALUES.development);
  const id = (await cli(member, "GET", `${dev}/secrets`)).body.secrets[0].id;
  assert.equal((await cli(viewer, "PATCH", `${dev}/secrets/${id}`, { value: "pwn" })).status, 403);
  // production id through the development path
  const prodId = (await cli(owner, "GET", `${prod}/secrets`)).body.secrets[0].id;
  assert.equal((await cli(member, "GET", `${dev}/secrets/${prodId}`)).status, 404);
});

test("CLI mutations keep encryption, version history and audit logging", async () => {
  const member = (await login("member")).accessToken;
  const dev = `/api/projects/${P}/environments/development`;

  const created = await cli(member, "POST", `${dev}/secrets`, { key: "FROM_CLI", value: "cli-plaintext-1" });
  assert.equal(created.status, 201);
  const id = created.body.secret.id;
  assert.equal(created.body.secret.value, undefined);

  const upd = await cli(member, "PATCH", `${dev}/secrets/${id}`, { value: "cli-plaintext-2", expectedVersion: 1 });
  assert.equal(upd.body.secret.version, 2);
  // stale base version is rejected
  assert.equal((await cli(member, "PATCH", `${dev}/secrets/${id}`, { value: "x", expectedVersion: 1 })).status, 409);

  const raw = await db.collection("secrets").findOne({ _id: id });
  assert.ok(!JSON.stringify(raw).includes("cli-plaintext"));
  assert.equal(raw.value.v, 1);
  const versions = await db.collection("secret_versions").find({ secretId: id }).sort({ versionNumber: 1 }).toArray();
  assert.deepEqual(versions.map((v) => [v.versionNumber, v.changeType, v.actorId]), [[1, "CREATED", "member"], [2, "UPDATED", "member"]]);
  assert.ok(!JSON.stringify(versions).includes("cli-plaintext"));

  const events = await db.collection("audit_logs").find({ targetId: id }).sort({ at: 1 }).toArray();
  assert.deepEqual(events.map((e) => e.action), ["secret.created", "secret.updated"]);
  assert.ok(events.every((e) => e.metadata.via === "cli" && e.actorId === "member"));
  assert.ok(!JSON.stringify(events).includes("cli-plaintext"));
});

test("exports are audited with a count, never values", async () => {
  const owner = (await login("owner")).accessToken;
  const before = await db.collection("audit_logs").countDocuments({ action: "secrets.exported" });
  const r = await cli(owner, "GET", `/api/projects/${P}/environments/production/export`);
  assert.equal(r.status, 200);
  const events = await db.collection("audit_logs").find({ action: "secrets.exported" }).toArray();
  assert.equal(events.length, before + 1);
  const last = events.at(-1);
  assert.equal(last.metadata.count, 1);
  assert.equal(last.metadata.via, "cli");
  assert.ok(!JSON.stringify(events).includes(SECRET_VALUES.production));
});

test("authorization happens before decryption on export", async () => {
  const owner = (await login("owner")).accessToken;
  const member = (await login("member")).accessToken;
  const prodEnv = await db.collection("environments").findOne({ projectId: P, slug: "production" });
  const sec = await db.collection("secrets").findOne({ environmentId: prodEnv._id });
  const bytes = Buffer.from(sec.value.ciphertext, "base64");
  bytes[0] ^= 1;
  await db.collection("secrets").updateOne({ _id: sec._id }, { $set: { "value.ciphertext": bytes.toString("base64") } });

  const prod = `/api/projects/${P}/environments/production/export`;
  assert.equal((await cli(member, "GET", prod)).status, 403); // gate first
  const bad = await cli(owner, "GET", prod); // authorized: fails closed, no partial data
  assert.equal(bad.status, 500);
  assert.equal(bad.body.secrets, undefined);
  await db.collection("secrets").updateOne({ _id: sec._id }, { $set: { value: sec.value } });
});

test("expiry, refresh rotation, reuse detection, logout and revoke-all", async () => {
  // expiry
  const a = await login("owner");
  await db.collection("cli_sessions").updateOne(
    { userId: "owner", accessHash: { $exists: true } },
    { $set: { accessExpiresAt: new Date(Date.now() - 1000) } },
    { sort: { createdAt: -1 } },
  );
  const expired = await cli(a.accessToken, "GET", "/api/projects");
  assert.equal(expired.status, 401);

  // refresh rotates and works
  const fresh = await pub("/api/cli/auth/refresh", { refreshToken: a.refreshToken });
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.body.accessToken, a.accessToken);
  assert.equal((await cli(fresh.body.accessToken, "GET", "/api/projects")).status, 200);

  // reusing the rotated refresh token is treated as theft: session revoked
  const reuse = await pub("/api/cli/auth/refresh", { refreshToken: a.refreshToken });
  assert.equal(reuse.status, 401);
  assert.equal((await cli(fresh.body.accessToken, "GET", "/api/projects")).status, 401);
  assert.equal((await pub("/api/cli/auth/refresh", { refreshToken: fresh.body.refreshToken })).status, 401);

  // logout revokes
  const b = await login("owner");
  assert.equal((await cli(b.accessToken, "POST", "/api/cli/auth/logout")).status, 200);
  assert.equal((await cli(b.accessToken, "GET", "/api/projects")).status, 401);
  assert.equal((await pub("/api/cli/auth/refresh", { refreshToken: b.refreshToken })).status, 401);
  assert.equal((await cli("keel_at_unknown", "POST", "/api/cli/auth/logout")).status, 200); // idempotent

  // revoke every CLI session from the browser
  const c = await login("owner");
  const d = await login("owner");
  const rev = await web("owner", "DELETE", "/api/cli/sessions");
  assert.equal(rev.status, 200);
  assert.ok(rev.body.revoked >= 2);
  assert.equal((await cli(c.accessToken, "GET", "/api/projects")).status, 401);
  assert.equal((await cli(d.accessToken, "GET", "/api/projects")).status, 401);
});

test("rate limits apply to login and secret retrieval", async () => {
  resetRateLimits();
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await pub("/api/cli/auth/device", {})).status);
  assert.equal(statuses.filter((s) => s === 200).length, 10);
  assert.equal(statuses.at(-1), 429);

  resetRateLimits();
  const { accessToken } = await login("owner");
  const url = `/api/projects/${P}/environments/production/export`;
  let limited = 0;
  for (let i = 0; i < 33; i++) if ((await cli(accessToken, "GET", url)).status === 429) limited++;
  assert.ok(limited >= 2);
  resetRateLimits();
});
