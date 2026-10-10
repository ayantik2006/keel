// Secret version history and rollback tests against a throwaway MongoDB.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_VERSIONS_MONGODB_URI ??
  "mongodb://127.0.0.1:27017/keel_versions_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const route = (p) => import(`../app/api/${p}`);
const projectsRoute = await route("projects/route.ts");
const projectRoute = await route("projects/[projectId]/route.ts");
const secretsRoute = await route("projects/[projectId]/environments/[env]/secrets/route.ts");
const secretRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/route.ts");
const versionsRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/versions/route.ts");
const versionRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/versions/[versionNumber]/route.ts");
const restoreRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/versions/[versionNumber]/restore/route.ts");
const invitesRoute = await route("projects/[projectId]/invitations/route.ts");
const acceptRoute = await route("invitations/accept/route.ts");
const accessRoute = await route("projects/[projectId]/environments/[env]/access/[userId]/route.ts");
const { encryptValue, decryptValue } = await import("../lib/crypto.ts");
const { migrateSecretVersions } = await import("../lib/migrate-secret-versions.ts");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  member: ["member@corp.test"],
  viewer: ["viewer@corp.test"],
  outsider: ["outsider@corp.test"],
};
const as = (u) => (globalThis.__testUser = u);
const req = (method, body, headers = { "content-type": "application/json" }) =>
  new Request("http://localhost/api", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const call = async (fn, r, params = {}) => {
  const res = await fn(r, { params: Promise.resolve(params) });
  return { status: res.status, body: await res.json() };
};

let client, db, P, Q;
const E = "development";
const S = (secretId, extra = {}) => ({ projectId: P, env: E, secretId, ...extra });

const create = async (user, key, value, projectId = P, env = E) => {
  as(user);
  const r = await call(secretsRoute.POST, req("POST", { key, value }), { projectId, env });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.secret;
};
const patch = (user, secretId, body, ctx = {}) => {
  as(user);
  return call(secretRoute.PATCH, req("PATCH", body), S(secretId, ctx));
};
const history = async (user, secretId, ctx = {}) => {
  as(user);
  return call(versionsRoute.GET, req("GET"), S(secretId, ctx));
};
const reveal = (user, secretId, n, ctx = {}) => {
  as(user);
  return call(versionRoute.GET, req("GET"), S(secretId, { versionNumber: String(n), ...ctx }));
};
const restore = (user, secretId, n, body = {}, ctx = {}) => {
  as(user);
  return call(restoreRoute.POST, req("POST", body), S(secretId, { versionNumber: String(n), ...ctx }));
};
const currentValue = async (secretId) => {
  as("owner");
  const r = await call(secretRoute.GET, req("GET"), S(secretId));
  return r.body.secret.value;
};
const versionDocs = (secretId) =>
  db.collection("secret_versions").find({ secretId }).sort({ versionNumber: 1 }).toArray();

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();

  as("owner");
  P = (await call(projectsRoute.POST, req("POST", { name: "Versioned", environments: ["development", "staging"] }))).body.project.id;
  Q = (await call(projectsRoute.POST, req("POST", { name: "Elsewhere", environments: ["development"] }))).body.project.id;

  for (const [user, role] of [["member", "member"], ["viewer", "viewer"]]) {
    as("owner");
    const inv = await call(invitesRoute.POST, req("POST", { email: `${user}@corp.test`, role }), { projectId: P });
    as(user);
    await call(acceptRoute.POST, req("POST", { token: inv.body.devAcceptUrl.split("#")[1] }));
    as("owner");
    // development only; staging stays denied
    await call(accessRoute.PUT, req("PUT"), { projectId: P, env: "development", userId: user });
  }
});
after(async () => {
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

let s1; // main secret

test("creating a secret records version 1 as CREATED, encrypted", async () => {
  s1 = await create("owner", "API_KEY", "value-one");
  assert.equal(s1.version, 1);
  const docs = await versionDocs(s1.id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].versionNumber, 1);
  assert.equal(docs[0].changeType, "CREATED");
  assert.equal(docs[0].actorId, "owner");
  assert.ok(!JSON.stringify(docs[0]).includes("value-one"));
  assert.equal(docs[0].value.v, 1); // key version metadata preserved
  assert.ok(docs[0].value.ciphertext && docs[0].value.iv && docs[0].value.tag);
  assert.equal(decryptValue(docs[0].value, s1.id), "value-one");
});

test("updates create ordered versions; list never contains values", async () => {
  assert.equal((await patch("member", s1.id, { value: "value-two" })).body.secret.version, 2);
  assert.equal((await patch("owner", s1.id, { value: "value-three" })).body.secret.version, 3);

  const h = await history("owner", s1.id);
  assert.equal(h.status, 200);
  assert.equal(h.body.currentVersion, 3);
  assert.deepEqual(h.body.versions.map((v) => v.versionNumber), [3, 2, 1]);
  assert.deepEqual(h.body.versions.map((v) => v.changeType), ["UPDATED", "UPDATED", "CREATED"]);
  assert.deepEqual(h.body.versions.map((v) => v.isCurrent), [true, false, false]);
  assert.equal(h.body.versions[1].changedBy.userId, "member");
  assert.equal(h.body.versions[1].changedBy.email, "member@corp.test");
  const text = JSON.stringify(h.body);
  for (const v of ["value-one", "value-two", "value-three"]) assert.ok(!text.includes(v));
  assert.ok(!text.includes("ciphertext"));

  const docs = await versionDocs(s1.id);
  for (const d of docs) assert.ok(!JSON.stringify(d).includes("value-"));
});

test("key rename alone does not create a version", async () => {
  const r = await patch("owner", s1.id, { key: "API_KEY_RENAMED" });
  assert.equal(r.status, 200);
  assert.equal(r.body.secret.version, 3);
  assert.equal((await versionDocs(s1.id)).length, 3);
  await patch("owner", s1.id, { key: "API_KEY" });
});

test("saving an unchanged value does not create a version", async () => {
  const r = await patch("owner", s1.id, { key: "API_KEY", value: "value-three" });
  assert.equal(r.status, 200);
  assert.equal(r.body.secret.version, 3);
  assert.equal((await versionDocs(s1.id)).length, 3);
});

test("historical values are revealed server-side and only when permitted", async () => {
  assert.equal((await reveal("owner", s1.id, 1)).body.version.value, "value-one");
  assert.equal((await reveal("viewer", s1.id, 2)).body.version.value, "value-two");
  assert.equal((await reveal("owner", s1.id, 99)).status, 404);
  assert.equal((await reveal("owner", s1.id, "abc")).status, 404);
  assert.equal((await reveal("owner", s1.id, "1.5")).status, 404);
  assert.equal((await reveal("outsider", s1.id, 1)).status, 404);
  as(null);
  assert.equal((await call(versionRoute.GET, req("GET"), S(s1.id, { versionNumber: "1" }))).status, 401);
  assert.equal((await call(versionsRoute.GET, req("GET"), S(s1.id))).status, 401);
});

test("rollback creates a new version and preserves all history", async () => {
  const before = await versionDocs(s1.id);
  const r = await restore("member", s1.id, 1, { expectedVersion: 3 });
  assert.equal(r.status, 200);
  assert.equal(r.body.secret.version, 4); // counter moves forward, not reset
  assert.equal(await currentValue(s1.id), "value-one");

  const after = await versionDocs(s1.id);
  assert.deepEqual(after.map((d) => d.versionNumber), [1, 2, 3, 4]);
  // earlier records untouched
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(after[i].value, before[i].value);
    assert.equal(after[i]._id, before[i]._id);
  }
  assert.equal(after[3].changeType, "ROLLED_BACK");
  assert.equal(after[3].restoredFromVersion, 1);
  assert.equal(after[3].actorId, "member");
  // new version is freshly encrypted, not a copy of v1's ciphertext
  assert.notEqual(after[3].value.iv, after[0].value.iv);
  assert.equal(decryptValue(after[3].value, s1.id), "value-one");
  assert.ok(!JSON.stringify(after[3]).includes("value-one"));
  // newer versions are still reachable
  assert.equal((await reveal("owner", s1.id, 3)).body.version.value, "value-three");
});

test("rollback is audited without values", async () => {
  const events = await db.collection("audit_logs").find({ action: "secret.rolled_back" }).toArray();
  assert.equal(events.length, 1);
  assert.equal(events[0].actorId, "member");
  assert.equal(events[0].targetId, s1.id);
  assert.equal(events[0].metadata.restoredFromVersion, 1);
  assert.equal(events[0].metadata.newVersion, 4);
  assert.ok(!JSON.stringify(events[0]).includes("value-"));
});

test("rollback authorization and validation", async () => {
  assert.equal((await restore("viewer", s1.id, 2)).status, 403); // read-only role
  assert.equal((await restore("outsider", s1.id, 2)).status, 404);
  assert.equal(
    (await restore("member", s1.id, 2, {}, { env: "staging" })).status,
    403, // no staging grant: environment gate, before the secret is looked up
  );
  assert.equal((await restore("owner", s1.id, 2, {}, { env: "staging" })).status, 404); // wrong env for this secret
  assert.equal((await restore("owner", s1.id, 2, {}, { projectId: Q })).status, 404); // wrong project
  assert.equal((await reveal("owner", s1.id, 1, { projectId: Q })).status, 404);
  assert.equal((await history("owner", s1.id, { projectId: Q })).status, 404);
  assert.equal((await restore("owner", s1.id, 4)).status, 400); // already current
  assert.equal((await restore("owner", s1.id, 77)).status, 404);
  assert.equal((await restore("owner", s1.id, 2, { expectedVersion: 1 })).status, 409); // stale
  assert.equal((await restore("owner", s1.id, 2, { expectedVersion: "x" })).status, 400);
  // nothing above changed anything
  assert.equal((await versionDocs(s1.id)).length, 4);
  assert.equal(await currentValue(s1.id), "value-one");
});

test("reveal respects environment access", async () => {
  const staging = await create("owner", "STAGING_KEY", "staging-secret", P, "staging");
  assert.equal((await reveal("member", staging.id, 1, { env: "staging" })).status, 403);
  assert.equal((await history("member", staging.id, { env: "staging" })).status, 403);
  assert.equal((await reveal("owner", staging.id, 1, { env: "staging" })).body.version.value, "staging-secret");
});

test("concurrent updates without a base version are serialized and none is lost", async () => {
  const sec = await create("owner", "CONCURRENT", "start");
  const values = ["c-1", "c-2", "c-3", "c-4"];
  const results = await Promise.all(values.map((v) => patch("owner", sec.id, { value: v })));
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200]);

  const docs = await versionDocs(sec.id);
  assert.deepEqual(docs.map((d) => d.versionNumber), [1, 2, 3, 4, 5]); // no gaps, no duplicates
  const recorded = docs.map((d) => decryptValue(d.value, sec.id));
  for (const v of values) assert.equal(recorded.filter((x) => x === v).length, 1);
  const current = await db.collection("secrets").findOne({ _id: sec.id });
  assert.equal(current.version, 5);
  assert.equal(decryptValue(current.value, sec.id), recorded[4]); // history matches current
});

test("concurrent updates with the same base version: exactly one wins", async () => {
  const sec = await create("owner", "CAS", "start");
  const results = await Promise.all(
    ["a", "b", "c", "d", "e"].map((v) => patch("owner", sec.id, { value: v, expectedVersion: 1 })),
  );
  const ok = results.filter((r) => r.status === 200);
  const conflict = results.filter((r) => r.status === 409);
  assert.equal(ok.length, 1);
  assert.equal(conflict.length, 4);
  const docs = await versionDocs(sec.id);
  assert.deepEqual(docs.map((d) => d.versionNumber), [1, 2]);
  // the loser's value was never written, and the winner's is current
  const stored = docs.map((d) => decryptValue(d.value, sec.id));
  assert.equal(stored.filter((v) => ["a", "b", "c", "d", "e"].includes(v)).length, 1);
  assert.equal(await currentValue(sec.id), stored[1]);
});

test("the version number can never be duplicated", async () => {
  const [first] = await versionDocs(s1.id);
  await assert.rejects(
    db.collection("secret_versions").insertOne({ ...first, _id: randomUUID() }),
    (err) => err.code === 11000,
  );
});

test("a crash between the secret update and the history write is repaired", async () => {
  const sec = await create("owner", "CRASH", "before-crash");
  // Simulate: the compare-and-set landed (version 2) but the process died
  // before the version record was written.
  const payload = encryptValue("crashed-value", sec.id);
  await db.collection("secrets").updateOne(
    { _id: sec.id },
    {
      $set: {
        value: payload,
        version: 2,
        lastChange: { type: "UPDATED", actorId: "member", at: new Date() },
      },
    },
  );
  assert.equal((await versionDocs(sec.id)).length, 1);

  // The next writer records the state it is about to replace first.
  const r = await patch("owner", sec.id, { value: "after-crash" });
  assert.equal(r.body.secret.version, 3);
  const docs = await versionDocs(sec.id);
  assert.deepEqual(docs.map((d) => d.versionNumber), [1, 2, 3]);
  assert.equal(decryptValue(docs[1].value, sec.id), "crashed-value");
  assert.equal(docs[1].actorId, "member"); // faithfully reconstructed
  assert.equal(docs[1].changeType, "UPDATED");
});

test("existing secrets: baseline only, no invented history", async () => {
  const id = randomUUID();
  const env = await db.collection("environments").findOne({ projectId: P, slug: "development" });
  const created = new Date("2026-01-02T03:04:05Z");
  await db.collection("secrets").insertOne({
    _id: id,
    projectId: P,
    environmentId: env._id,
    key: "LEGACY",
    value: encryptValue("legacy-value", id),
    createdAt: created,
    updatedAt: created,
  });

  const h = await history("owner", id);
  assert.equal(h.body.versions.length, 1);
  assert.equal(h.body.versions[0].changeType, "BASELINE");
  assert.equal(h.body.versions[0].changedBy, null);
  assert.equal(h.body.versions[0].versionNumber, 1);
  assert.equal(h.body.versions[0].createdAt, created.toISOString());

  const up = await patch("owner", id, { value: "legacy-updated" });
  assert.equal(up.body.secret.version, 2);
  assert.equal((await reveal("owner", id, 1)).body.version.value, "legacy-value");
  assert.equal((await restore("owner", id, 1)).body.secret.version, 3);
  assert.equal(await currentValue(id), "legacy-value");
  assert.equal((await versionDocs(id)).length, 3);
});

test("migration: dry run writes nothing, apply is idempotent and not duplicated", async () => {
  const id = randomUUID();
  const env = await db.collection("environments").findOne({ projectId: P, slug: "development" });
  await db.collection("secrets").insertOne({
    _id: id,
    projectId: P,
    environmentId: env._id,
    key: "LEGACY_2",
    value: encryptValue("legacy-two", id),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const dry = await migrateSecretVersions(db, { apply: false });
  assert.ok(dry.baselinesCreated >= 1);
  assert.equal((await versionDocs(id)).length, 0);
  assert.equal((await db.collection("secrets").findOne({ _id: id })).version, undefined);

  await migrateSecretVersions(db, { apply: true });
  const docs = await versionDocs(id);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].changeType, "BASELINE");
  assert.equal(decryptValue(docs[0].value, id), "legacy-two");
  assert.equal((await db.collection("secrets").findOne({ _id: id })).version, 1);

  assert.equal((await migrateSecretVersions(db, { apply: true })).baselinesCreated, 0);
  assert.equal((await versionDocs(id)).length, 1);
  // history view does not add a duplicate
  assert.equal((await history("owner", id)).body.versions.length, 1);
});

test("deleting a secret removes its history; it is no longer reachable", async () => {
  const sec = await create("owner", "TO_DELETE", "gone-value");
  await patch("owner", sec.id, { value: "gone-value-2" });
  as("owner");
  assert.equal((await call(secretRoute.DELETE, req("DELETE"), S(sec.id))).status, 200);
  assert.equal((await history("owner", sec.id)).status, 404);
  assert.equal((await reveal("owner", sec.id, 1)).status, 404);
  assert.equal((await restore("owner", sec.id, 1)).status, 404);
  assert.equal((await versionDocs(sec.id)).length, 0);
});

test("deleting a project removes all version history", async () => {
  as("owner");
  const before = await db.collection("secret_versions").countDocuments({ projectId: P });
  assert.ok(before > 0);
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 200);
  assert.equal(await db.collection("secret_versions").countDocuments({ projectId: P }), 0);
});

test("index setup removes exact duplicate versions and rebuilds the unique index", async () => {
  const { ensureIndexes } = await import("../lib/db.ts");
  const col = db.collection("secret_versions");
  await col.dropIndex("secretId_1_versionNumber_1").catch(() => {});

  const base = {
    secretId: "dup-secret",
    projectId: "dup-project",
    environmentId: "dup-env",
    key: "K",
    changeType: "CREATED",
    actorId: "owner",
    createdAt: new Date(),
  };
  const same = { ciphertext: "AAAA", iv: "BBBB", tag: "CCCC", v: 1 };
  await col.insertMany([
    { _id: "d1", versionNumber: 1, value: same, ...base },
    { _id: "d2", versionNumber: 1, value: same, ...base },
    { _id: "d3", versionNumber: 1, value: same, ...base },
  ]);

  await ensureIndexes(db);
  assert.equal(await col.countDocuments({ secretId: "dup-secret" }), 1);
  const names = (await col.indexes()).map((i) => i.name);
  assert.ok(names.includes("secretId_1_versionNumber_1"));
  await assert.rejects(
    col.insertOne({ _id: "d4", versionNumber: 1, value: same, ...base }),
    (err) => err.code === 11000,
  );

  // Records that differ are never deleted.
  await col.dropIndex("secretId_1_versionNumber_1");
  await col.insertOne({ _id: "d5", versionNumber: 1, value: { ...same, ciphertext: "ZZZZ" }, ...base });
  const orig = console.error;
  console.error = () => {};
  await ensureIndexes(db);
  console.error = orig;
  assert.equal(await col.countDocuments({ secretId: "dup-secret" }), 2);
  await col.deleteMany({ secretId: "dup-secret" });
  await ensureIndexes(db);
});
