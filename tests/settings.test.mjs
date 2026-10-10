// Settings page backends: general settings, members, security overview, audit
// filters and CLI sessions. Real handlers and MongoDB over HTTP; Clerk stubbed.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_SETTINGS_MONGODB_URI ?? "mongodb://127.0.0.1:27017/keel_settings_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
const KEY = randomBytes(32).toString("base64");
process.env.SECRETS_ENCRYPTION_KEY = KEY;

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  admin: ["admin@corp.test"],
  member: ["member@corp.test"],
  viewer: ["viewer@corp.test"],
  outsider: ["outsider@corp.test"],
};
globalThis.__testNames = { owner: "Olive Owner", admin: "Adam Admin" };

const SENTINEL = "SENTINEL-settings-secret-31";
let backend, client, db, P, Q;

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
    /* not json */
  }
  return { status: res.status, text, body: json };
};

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();

  P = (await send("owner", "POST", "/api/projects", {
    name: "Settings Project",
    description: "original",
    environments: ["development", "production"],
  })).body.project.id;
  Q = (await send("outsider", "POST", "/api/projects", {
    name: "Someone Elses",
    environments: ["development"],
  })).body.project.id;

  for (const [user, role] of [["admin", "admin"], ["member", "member"], ["viewer", "viewer"]]) {
    const inv = await send("owner", "POST", `/api/projects/${P}/invitations`, { email: `${user}@corp.test`, role });
    await send(user, "POST", "/api/invitations/accept", { token: inv.body.devAcceptUrl.split("#")[1] });
  }
  await send("owner", "PUT", `/api/projects/${P}/environments/development/access/member`);
  await send("owner", "POST", `/api/projects/${P}/environments/development/secrets`, { key: "DB", value: SENTINEL });
  await send("owner", "POST", `/api/projects/${P}/invitations`, { email: "pending@corp.test", role: "viewer" });
});
beforeEach(() => resetRateLimits());
after(async () => {
  await backend.close();
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

// ---- General ---------------------------------------------------------------
test("general settings: validation, duplicates and who may change them", async () => {
  const patch = (user, body, id = P) => send(user, "PATCH", `/api/projects/${id}`, body);

  assert.equal((await patch("owner", { name: "   " })).status, 400);
  assert.equal((await patch("owner", { name: "x".repeat(61) })).status, 400);
  assert.equal((await patch("owner", { description: "d".repeat(281) })).status, 400);
  assert.equal((await patch("owner", {})).status, 400);

  await send("owner", "POST", "/api/projects", { name: "Taken Name", environments: ["development"] });
  assert.equal((await patch("owner", { name: "taken name" })).status, 409);

  assert.equal((await patch("member", { name: "Nope" })).status, 403);
  assert.equal((await patch("viewer", { name: "Nope" })).status, 403);
  assert.equal((await patch("outsider", { name: "Nope" })).status, 404);
  assert.equal((await patch(null, { name: "Nope" })).status, 401);
  assert.equal((await patch("owner", { name: "Hijack" }, Q)).status, 404);

  const ok = await patch("admin", { name: "Settings Project 2", description: "" });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.project.name, "Settings Project 2");
  assert.equal(ok.body.project.description, undefined);
  const again = await send("owner", "GET", `/api/projects/${P}`);
  assert.equal(again.body.project.name, "Settings Project 2");
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "project.updated", actorId: "admin" }), 1);

  await patch("owner", { name: "Settings Project", description: "original" });
});

// ---- Members ---------------------------------------------------------------
test("members: names are stored and shown; status data is present", async () => {
  const r = await send("viewer", "GET", `/api/projects/${P}/members`);
  assert.equal(r.status, 200);
  const owner = r.body.members.find((m) => m.userId === "owner");
  assert.equal(owner.name, "Olive Owner");
  assert.equal(owner.email, "owner@corp.test");
  assert.equal(r.body.members.find((m) => m.userId === "member").name, undefined);
  assert.ok(r.body.members.every((m) => m.role && m.createdAt));
});

test("members: the owner is protected and nobody can raise their own privileges", async () => {
  const role = (user, target, role) =>
    send(user, "PATCH", `/api/projects/${P}/members/${target}`, { role });
  const remove = (user, target) => send(user, "DELETE", `/api/projects/${P}/members/${target}`);

  // final owner: cannot be demoted, removed, or leave
  assert.equal((await role("owner", "owner", "admin")).status, 400); // own role
  assert.equal((await role("admin", "owner", "viewer")).status, 403);
  assert.equal((await remove("admin", "owner")).status, 403);
  assert.equal((await remove("owner", "owner")).status, 403);

  // no self promotion, no handing out ownership
  assert.equal((await role("member", "member", "admin")).status, 403);
  assert.equal((await role("admin", "admin", "owner")).status, 400);
  assert.equal((await role("admin", "viewer", "owner")).status, 400);
  assert.equal((await role("viewer", "viewer", "admin")).status, 403);

  assert.equal(await db.collection("project_memberships").countDocuments({ projectId: P, role: "owner" }), 1);
});

// ---- Security --------------------------------------------------------------
test("security overview: reflects real state and exposes no key material", async () => {
  const r = await send("owner", "GET", `/api/projects/${P}/security`);
  assert.equal(r.status, 200);
  const s = r.body;
  assert.equal(s.encryption.algorithm, "AES-256-GCM");
  assert.equal(s.encryption.keyConfigured, true);
  assert.equal(s.encryption.currentKeyVersion, 1);
  assert.deepEqual(s.encryption.records, { total: 1, onCurrentKeyVersion: 1, other: 0 });
  assert.equal(s.encryption.keyRotation, false);
  assert.equal(s.encryption.externalKms, false);
  assert.deepEqual(s.access.members, { owner: 1, admin: 1, member: 1, viewer: 1 });
  assert.equal(s.access.pendingInvitations, 1);
  const dev = s.access.environments.find((e) => e.slug === "development");
  const prod = s.access.environments.find((e) => e.slug === "production");
  assert.deepEqual([dev.membersAndViewersWithAccess, dev.membersAndViewersTotal], [1, 2]);
  assert.equal(prod.membersAndViewersWithAccess, 0);
  assert.equal(s.integrations.vercel, null);
  assert.ok(s.auditLog.events > 0);

  // nothing sensitive anywhere in the payload
  for (const secret of [KEY, SENTINEL, "ciphertext", "tokenEnc", "hookEnc", "keel_at_", "keel_rt_"])
    assert.ok(!r.text.includes(secret), `leaked ${secret.slice(0, 8)}`);
});

test("security overview: integration shows status but never credentials", async () => {
  await db.collection("integrations").insertOne({
    _id: "int-1",
    projectId: P,
    provider: "vercel",
    status: "active",
    tokenEnc: { v: 1, ciphertext: "CIPHERTEXT-MARK", iv: "AA", tag: "AA" },
    vercelProjectName: "web-app",
    mappings: {},
    autoRedeploy: false,
    conflictPolicy: "skip",
    createdBy: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const r = await send("admin", "GET", `/api/projects/${P}/security`);
  assert.deepEqual(r.body.integrations.vercel, { status: "active", project: "web-app" });
  assert.ok(!r.text.includes("CIPHERTEXT-MARK"));
  await db.collection("integrations").deleteOne({ _id: "int-1" });
});

test("security overview: a broken key is reported without revealing why or what", async () => {
  process.env.SECRETS_ENCRYPTION_KEY = "not-a-valid-key";
  try {
    const r = await send("owner", "GET", `/api/projects/${P}/security`);
    assert.equal(r.status, 200);
    assert.equal(r.body.encryption.keyConfigured, false);
    assert.ok(!r.text.includes("not-a-valid-key"));
  } finally {
    process.env.SECRETS_ENCRYPTION_KEY = KEY;
  }
});

test("security overview: restricted to owners and admins, browser only", async () => {
  const get = (u, id = P) => send(u, "GET", `/api/projects/${id}/security`);
  assert.equal((await get("admin")).status, 200);
  assert.equal((await get("member")).status, 403);
  assert.equal((await get("viewer")).status, 403);
  assert.equal((await get("outsider")).status, 404);
  assert.equal((await get(null)).status, 401);
  assert.equal((await get("owner", Q)).status, 404);

  const dev = await send(null, "POST", "/api/cli/auth/device", {});
  await send("owner", "POST", "/api/cli/auth/approve", { userCode: dev.body.userCode });
  const tok = await send(null, "POST", "/api/cli/auth/token", { deviceCode: dev.body.deviceCode });
  const viaCli = await send(null, "GET", `/api/projects/${P}/security`, undefined, {
    authorization: `Bearer ${tok.body.accessToken}`,
  });
  assert.equal(viaCli.status, 403);
});

// ---- Audit filters -----------------------------------------------------------
test("audit: category, actor and date filters combine with pagination", async () => {
  // deterministic extra events at known times
  const at = (iso) => new Date(iso);
  await db.collection("audit_logs").insertMany([
    { _id: "t1", projectId: P, actorId: "admin", action: "secret.updated", targetType: "secret", targetId: "s", metadata: {}, at: at("2020-01-10T12:00:00Z") },
    { _id: "t2", projectId: P, actorId: "admin", action: "member.removed", targetType: "member", targetId: "m", metadata: {}, at: at("2020-01-11T23:30:00Z") },
    { _id: "t3", projectId: P, actorId: "member", action: "secret.created", targetType: "secret", targetId: "s2", metadata: {}, at: at("2020-01-12T00:10:00Z") },
  ]);
  const q = (qs) => send("owner", "GET", `/api/projects/${P}/audit?${qs}`);
  const ids = (r) => r.body.events.map((e) => e.id);

  assert.deepEqual(ids(await q("category=secrets&from=2020-01-01&to=2020-01-31")), ["t3", "t1"]);
  assert.deepEqual(ids(await q("category=access&from=2020-01-01&to=2020-01-31")), ["t2"]);
  assert.deepEqual(ids(await q("actor=admin&from=2020-01-01&to=2020-01-31")), ["t2", "t1"]);
  // "to" is inclusive of the whole day
  assert.deepEqual(ids(await q("from=2020-01-11&to=2020-01-11")), ["t2"]);
  assert.deepEqual(ids(await q("from=2020-02-01")).filter((i) => i.startsWith("t")), []);

  // filtered pagination walks each matching event once
  const p1 = await q("actor=admin&from=2020-01-01&to=2020-01-31&limit=1");
  assert.deepEqual(ids(p1), ["t2"]);
  const p2 = await q(`actor=admin&from=2020-01-01&to=2020-01-31&limit=1&cursor=${p1.body.nextCursor}`);
  assert.deepEqual(ids(p2), ["t1"]);
  assert.equal(p2.body.nextCursor, null);

  for (const bad of ["category=nope", "actor=a%20b%3B", "from=yesterday", "to=2020-13-45"])
    assert.equal((await q(bad)).status, 400, bad);
});

test("audit: restricted to owners and admins, other projects are invisible", async () => {
  const get = (u, id = P) => send(u, "GET", `/api/projects/${id}/audit`);
  assert.equal((await get("admin")).status, 200);
  assert.equal((await get("member")).status, 403);
  assert.equal((await get("viewer")).status, 403);
  assert.equal((await get("outsider")).status, 404);
  assert.equal((await get("owner", Q)).status, 404);
  const own = await send("outsider", "GET", `/api/projects/${Q}/audit`);
  assert.ok(own.body.events.every((e) => e.targetId !== P));
});

// ---- Account / CLI sessions -------------------------------------------------------
async function cliLogin(user, name) {
  const dev = await send(null, "POST", "/api/cli/auth/device", { deviceName: name });
  await send(user, "POST", "/api/cli/auth/approve", { userCode: dev.body.userCode });
  const tok = await send(null, "POST", "/api/cli/auth/token", { deviceCode: dev.body.deviceCode });
  return tok.body;
}

test("account: users list and revoke only their own CLI sessions", async () => {
  await db.collection("cli_sessions").deleteMany({});
  resetRateLimits();
  const a1 = await cliLogin("owner", "owner laptop");
  resetRateLimits();
  const a2 = await cliLogin("owner", "owner desktop");
  resetRateLimits();
  const b1 = await cliLogin("admin", "admin laptop");

  const mine = await send("owner", "GET", "/api/cli/sessions");
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.sessions.map((s) => s.deviceName).sort(), ["owner desktop", "owner laptop"]);
  for (const t of [a1.accessToken, a1.refreshToken, b1.accessToken])
    assert.ok(!mine.text.includes(t));
  assert.ok(!/accessHash|refreshHash|token/i.test(mine.text));

  const target = mine.body.sessions.find((s) => s.deviceName === "owner laptop");
  const adminSessions = (await send("admin", "GET", "/api/cli/sessions")).body.sessions;
  // cannot revoke someone else's
  assert.equal((await send("owner", "DELETE", `/api/cli/sessions/${adminSessions[0].id}`)).status, 404);
  assert.equal((await send(null, "DELETE", `/api/cli/sessions/${target.id}`)).status, 401);

  assert.equal((await send("owner", "DELETE", `/api/cli/sessions/${target.id}`)).status, 200);
  assert.equal((await send(null, "GET", "/api/projects", undefined, { authorization: `Bearer ${a1.accessToken}` })).status, 401);
  assert.equal((await send(null, "GET", "/api/projects", undefined, { authorization: `Bearer ${a2.accessToken}` })).status, 200);
  assert.equal((await send("owner", "DELETE", `/api/cli/sessions/${target.id}`)).status, 404); // already revoked

  const left = await send("owner", "GET", "/api/cli/sessions");
  assert.deepEqual(left.body.sessions.map((s) => s.deviceName), ["owner desktop"]);

  const all = await send("owner", "DELETE", "/api/cli/sessions");
  assert.equal(all.body.revoked, 1);
  assert.equal((await send("owner", "GET", "/api/cli/sessions")).body.sessions.length, 0);
  assert.equal((await send("admin", "GET", "/api/cli/sessions")).body.sessions.length, 1); // untouched
});

test("account: CLI tokens cannot list or revoke sessions", async () => {
  resetRateLimits();
  const t = await cliLogin("owner", "token holder");
  const h = { authorization: `Bearer ${t.accessToken}` };
  assert.equal((await send(null, "GET", "/api/cli/sessions", undefined, h)).status, 403);
  assert.equal((await send(null, "DELETE", "/api/cli/sessions", undefined, h)).status, 403);
});

// ---- Existing behaviour ------------------------------------------------------------
test("secret CRUD still works for each role after the settings changes", async () => {
  const base = `/api/projects/${P}/environments/development/secrets`;
  const created = await send("member", "POST", base, { key: "CRUD_KEY", value: "v1" });
  assert.equal(created.status, 201);
  const id = created.body.secret.id;
  assert.equal((await send("member", "PATCH", `${base}/${id}`, { value: "v2" })).status, 200);
  assert.equal((await send("member", "GET", `${base}/${id}`)).body.secret.value, "v2");
  assert.equal((await send("viewer", "POST", base, { key: "NOPE", value: "x" })).status, 403);
  assert.equal((await send("owner", "DELETE", `${base}/${id}`)).status, 200);
});
