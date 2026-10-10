// Audit log: coverage of events and the read API (real handlers, real MongoDB).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_AUDIT_MONGODB_URI ?? "mongodb://127.0.0.1:27017/keel_audit_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const { startBackend, resetRateLimits } = await import("./helpers/backend.mjs");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  admin: ["admin@corp.test"],
  member: ["member@corp.test"],
  outsider: ["outsider@corp.test"],
};

const SENTINEL = "SENTINEL-audit-secret-77";
let backend, client, db, P, secretId;

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
const audit = (user, qs = "") => send(user, "GET", `/api/projects/${P}/audit${qs}`);
const actionsOf = async (filter = {}) =>
  (await db.collection("audit_logs").find({ projectId: P, ...filter }).sort({ at: 1 }).toArray()).map((e) => e.action);

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
  backend = await startBackend();

  P = (await send("owner", "POST", "/api/projects", { name: "Audited", environments: ["development"] })).body.project.id;
  for (const [user, role] of [["admin", "admin"], ["member", "member"]]) {
    const inv = await send("owner", "POST", `/api/projects/${P}/invitations`, { email: `${user}@corp.test`, role });
    await send(user, "POST", "/api/invitations/accept", { token: inv.body.devAcceptUrl.split("#")[1] });
  }
  await send("owner", "PUT", `/api/projects/${P}/environments/development/access/member`);
});
after(async () => {
  await backend.close();
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

test("secret lifecycle and reads are all recorded", async () => {
  const base = `/api/projects/${P}/environments/development`;
  const created = await send("member", "POST", `${base}/secrets`, { key: "DB_PASS", value: SENTINEL });
  secretId = created.body.secret.id;
  await send("member", "PATCH", `${base}/secrets/${secretId}`, { value: SENTINEL + "-2" });

  // viewing the current value and an old version
  await send("member", "GET", `${base}/secrets/${secretId}`);
  await send("member", "GET", `${base}/secrets/${secretId}/versions/1`);
  await send("member", "POST", `${base}/secrets/${secretId}/versions/1/restore`, {});
  await send("member", "GET", `${base}/export?format=dotenv`);
  await send("owner", "POST", `${base}/import`, { entries: [{ key: "IMPORTED", value: "x" }] });
  await send("owner", "DELETE", `${base}/secrets/${secretId}`);

  const actions = await actionsOf();
  for (const expected of [
    "secret.created",
    "secret.updated",
    "secret.revealed",
    "secret.version_revealed",
    "secret.rolled_back",
    "secrets.exported",
    "secrets.imported",
    "secret.deleted",
  ])
    assert.ok(actions.includes(expected), expected);

  // reads are attributed and carry no value
  const revealed = await db.collection("audit_logs").findOne({ action: "secret.revealed" });
  assert.equal(revealed.actorId, "member");
  assert.equal(revealed.metadata.key, "DB_PASS");
  assert.ok(!JSON.stringify(await db.collection("audit_logs").find({}).toArray()).includes(SENTINEL));
});

test("repeated reads within a minute are recorded once", async () => {
  const base = `/api/projects/${P}/environments/development`;
  const s = await send("owner", "POST", `${base}/secrets`, { key: "DEDUP", value: "v" });
  const id = s.body.secret.id;
  for (let i = 0; i < 4; i++) await send("owner", "GET", `${base}/secrets/${id}`);
  assert.equal(await db.collection("audit_logs").countDocuments({ action: "secret.revealed", targetId: id }), 1);
});

test("project changes are recorded", async () => {
  assert.equal((await send("admin", "PATCH", `/api/projects/${P}`, { name: "Audited Renamed" })).status, 200);
  const ev = await db.collection("audit_logs").findOne({ action: "project.updated" });
  assert.equal(ev.actorId, "admin");
  assert.deepEqual([ev.metadata.fromName, ev.metadata.toName], ["Audited", "Audited Renamed"]);
});

test("only owners and admins can read the log, and only via the browser", async () => {
  for (const user of ["owner", "admin"]) {
    const r = await audit(user);
    assert.equal(r.status, 200, user);
    assert.ok(r.body.events.length > 0);
  }
  assert.equal((await audit("member")).status, 403);
  assert.equal((await audit("outsider")).status, 404);
  assert.equal((await audit(null)).status, 401);

  const dev = await send(null, "POST", "/api/cli/auth/device", {});
  await send("owner", "POST", "/api/cli/auth/approve", { userCode: dev.body.userCode });
  const tok = await send(null, "POST", "/api/cli/auth/token", { deviceCode: dev.body.deviceCode });
  const viaCli = await send(null, "GET", `/api/projects/${P}/audit`, undefined, {
    authorization: `Bearer ${tok.body.accessToken}`,
  });
  assert.equal(viaCli.status, 403);
});

test("events are newest first, resolve actors, and never contain values", async () => {
  const r = await audit("owner", "?limit=100");
  const times = r.body.events.map((e) => e.at);
  assert.deepEqual(times, [...times].sort().reverse());

  const reveal = r.body.events.find((e) => e.action === "secret.revealed" && e.actor.userId === "member");
  assert.equal(reveal.actor.email, "member@corp.test");
  assert.equal(reveal.actor.isYou, false);
  const mine = r.body.events.find((e) => e.actor.userId === "owner");
  assert.equal(mine.actor.isYou, true);

  assert.ok(!r.text.includes(SENTINEL));
  assert.ok(!/tokenHash|keel_at_|keel_rt_|devAcceptUrl/.test(r.text));
});

test("pagination walks every event once; filters work; bad input is rejected", async () => {
  const total = await db.collection("audit_logs").countDocuments({ projectId: P });
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const r = await audit("owner", `?limit=5${cursor ? `&cursor=${cursor}` : ""}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.events.length <= 5);
    seen.push(...r.body.events.map((e) => e.id));
    cursor = r.body.nextCursor;
    pages++;
  } while (cursor && pages < 50);
  assert.equal(seen.length, total);
  assert.equal(new Set(seen).size, total);
  assert.ok(pages > 1);

  const filtered = await audit("owner", "?action=secret.revealed&limit=100");
  assert.ok(filtered.body.events.length >= 1);
  assert.ok(filtered.body.events.every((e) => e.action === "secret.revealed"));

  assert.equal((await audit("owner", "?action=" + encodeURIComponent("x'; drop"))).status, 400);
  assert.equal((await audit("owner", "?cursor=not-a-cursor")).status, 400);
  assert.equal((await audit("owner", "?limit=100000")).status, 200); // clamped
});

test("environment access denials and grants remain visible", async () => {
  await send("member", "GET", `/api/projects/${P}/environments/staging/secrets`); // 404, not an env
  await send("owner", "DELETE", `/api/projects/${P}/environments/development/access/member`);
  await send("member", "GET", `/api/projects/${P}/environments/development/secrets`); // now denied
  const actions = await actionsOf();
  assert.ok(actions.includes("environment.access_revoked"));
  assert.ok(actions.includes("environment.access_denied"));
});

test("project deletion is recorded and the history stays in the database", async () => {
  resetRateLimits();
  assert.equal((await send("owner", "DELETE", `/api/projects/${P}`)).status, 200);
  const ev = await db.collection("audit_logs").findOne({ action: "project.deleted", projectId: P });
  assert.equal(ev.actorId, "owner");
  assert.equal(ev.metadata.name, "Audited Renamed");
  // nobody can read it through the API any more (no membership left)
  assert.equal((await audit("owner")).status, 404);
});
