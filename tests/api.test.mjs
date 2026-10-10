// Integration tests for the secrets API against a throwaway MongoDB database.
// Clerk is stubbed (scripts/ts-loader), so no real sessions are needed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

const TEST_URI =
  process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27017/keel_test";
// Guard: this suite drops the database it runs against.
assert.match(new URL(TEST_URI).pathname, /_test$/, "test database name must end in _test");

process.env.MONGODB_URI = TEST_URI;
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const projectsRoute = await import("../app/api/projects/route.ts");
const projectRoute = await import("../app/api/projects/[projectId]/route.ts");
const secretsRoute = await import(
  "../app/api/projects/[projectId]/environments/[env]/secrets/route.ts"
);
const secretRoute = await import(
  "../app/api/projects/[projectId]/environments/[env]/secrets/[secretId]/route.ts"
);
const { migrateSecrets } = await import("../lib/migrate-secrets.ts");
const { encryptValue } = await import("../lib/crypto.ts");

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

let client;
let db;
before(async () => {
  client = new MongoClient(TEST_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
});
after(async () => {
  await db.dropDatabase();
  await client.close();
  process.exit(0); // the app's shared Mongo connection stays open otherwise
});

let project;
const S = () => ({ projectId: project.id, env: "development" });
const create = (key, value) =>
  call(secretsRoute.POST, req("POST", { key, value }), S());

test("unauthenticated requests are rejected", async () => {
  as(null);
  assert.equal((await call(projectsRoute.GET, req("GET"))).status, 401);
  assert.equal((await call(secretsRoute.GET, req("GET"), { projectId: "x", env: "development" })).status, 401);
  assert.equal(
    (await call(secretRoute.GET, req("GET"), { projectId: "x", env: "development", secretId: "y" })).status,
    401,
  );
});

test("create stores ciphertext, never plaintext", async () => {
  as("user_A");
  const p = await call(
    projectsRoute.POST,
    req("POST", { name: "Web App", environments: ["development", "production"] }),
  );
  assert.equal(p.status, 201);
  project = p.body.project;

  const plaintext = "postgres://admin:hunter2-very-secret@db.internal/app";
  const res = await create("DATABASE_URL", plaintext);
  assert.equal(res.status, 201);
  assert.equal(res.body.secret.value, undefined);

  const raw = await db.collection("secrets").findOne({ _id: res.body.secret.id });
  const serialized = JSON.stringify(raw);
  assert.ok(!serialized.includes("hunter2"));
  assert.ok(!serialized.includes(process.env.SECRETS_ENCRYPTION_KEY));
  assert.equal(raw.value.v, 1);
  for (const f of ["ciphertext", "iv", "tag"]) assert.equal(typeof raw.value[f], "string");
});

test("authorized read returns the correct plaintext", async () => {
  as("user_A");
  const list = await call(secretsRoute.GET, req("GET"), S());
  assert.equal(list.body.secrets.length, 1);
  assert.ok(!JSON.stringify(list.body).includes("hunter2"));
  assert.equal(list.body.secrets[0].value, undefined);

  const id = list.body.secrets[0].id;
  const got = await call(secretRoute.GET, req("GET"), { ...S(), secretId: id });
  assert.equal(got.body.secret.value, "postgres://admin:hunter2-very-secret@db.internal/app");
});

test("update re-encrypts with a fresh nonce", async () => {
  as("user_A");
  const [{ id }] = (await call(secretsRoute.GET, req("GET"), S())).body.secrets;
  const before = await db.collection("secrets").findOne({ _id: id });
  const up = await call(secretRoute.PATCH, req("PATCH", { value: "rotated-value" }), { ...S(), secretId: id });
  assert.equal(up.status, 200);
  const after = await db.collection("secrets").findOne({ _id: id });
  assert.notEqual(after.value.iv, before.value.iv);
  assert.notEqual(after.value.ciphertext, before.value.ciphertext);
  assert.ok(!JSON.stringify(after).includes("rotated-value"));
  const got = await call(secretRoute.GET, req("GET"), { ...S(), secretId: id });
  assert.equal(got.body.secret.value, "rotated-value");
});

test("other users cannot read, change or delete secrets", async () => {
  as("user_A");
  const [{ id }] = (await call(secretsRoute.GET, req("GET"), S())).body.secrets;
  const SS = { ...S(), secretId: id };

  as("user_B");
  for (const [fn, r] of [
    [secretsRoute.GET, req("GET")],
    [secretsRoute.POST, req("POST", { key: "X", value: "y" })],
    [secretRoute.GET, req("GET")],
    [secretRoute.PATCH, req("PATCH", { value: "pwn" })],
    [secretRoute.DELETE, req("DELETE")],
  ]) {
    const res = await call(fn, r, SS);
    assert.equal(res.status, 404);
    assert.ok(!JSON.stringify(res.body).includes("rotated-value"));
  }

  as("user_A");
  const still = await call(secretRoute.GET, req("GET"), SS);
  assert.equal(still.body.secret.value, "rotated-value");
});

test("a tampered database record fails closed without leaking data", async () => {
  as("user_A");
  const made = await create("TAMPERED", "tamper-target-value");
  const id = made.body.secret.id;
  const raw = await db.collection("secrets").findOne({ _id: id });
  const bytes = Buffer.from(raw.value.ciphertext, "base64");
  bytes[0] ^= 1;
  await db.collection("secrets").updateOne({ _id: id }, { $set: { "value.ciphertext": bytes.toString("base64") } });

  const origError = console.error;
  console.error = () => {};
  const res = await call(secretRoute.GET, req("GET"), { ...S(), secretId: id });
  console.error = origError;

  assert.equal(res.status, 500);
  assert.deepEqual(Object.keys(res.body), ["error"]);
  assert.ok(!JSON.stringify(res.body).includes("tamper-target-value"));
});

test("a ciphertext moved to another record does not decrypt", async () => {
  as("user_A");
  const a = (await create("MOVE_SRC", "source-value")).body.secret.id;
  const b = (await create("MOVE_DST", "dest-value")).body.secret.id;
  const src = await db.collection("secrets").findOne({ _id: a });
  await db.collection("secrets").updateOne({ _id: b }, { $set: { value: src.value } });

  const origError = console.error;
  console.error = () => {};
  const res = await call(secretRoute.GET, req("GET"), { ...S(), secretId: b });
  console.error = origError;
  assert.equal(res.status, 500);
});

test("delete removes the secret", async () => {
  as("user_A");
  const made = await create("TO_DELETE", "gone");
  const SS = { ...S(), secretId: made.body.secret.id };
  assert.equal((await call(secretRoute.DELETE, req("DELETE"), SS)).status, 200);
  assert.equal((await call(secretRoute.GET, req("GET"), SS)).status, 404);
});

test("legacy records: fail closed until the explicit migration runs", async () => {
  as("user_A");
  const now = new Date();
  const base = {
    projectId: project.id,
    environmentId: (await db.collection("environments").findOne({ projectId: project.id, slug: "development" }))._id,
    createdAt: now,
    updatedAt: now,
  };
  // Encrypted before the version field existed: same crypto, no `v`.
  const { v: _v, ...unversioned } = encryptValue("legacy-encrypted", "legacy-1");
  await db.collection("secrets").insertMany([
    { _id: "legacy-1", key: "LEGACY_ENC", value: unversioned, ...base },
    { _id: "legacy-2", key: "LEGACY_PLAIN", value: "legacy-plaintext", ...base },
    { _id: "legacy-3", key: "LEGACY_BAD", value: { ...unversioned, tag: encryptValue("x", "other").tag }, ...base },
  ]);

  // Not silently interpreted: reads fail closed.
  const origError = console.error;
  console.error = () => {};
  for (const id of ["legacy-1", "legacy-2"]) {
    const res = await call(secretRoute.GET, req("GET"), { ...S(), secretId: id });
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes("legacy-"));
  }
  console.error = origError;

  // Dry run writes nothing.
  const dry = await migrateSecrets(db, { apply: false });
  assert.equal(dry.applied, false);
  assert.equal(dry.stamped, 1);
  assert.equal(dry.encryptedFromPlaintext, 1);
  assert.deepEqual(dry.failed.map((f) => f.id), ["legacy-3"]);
  assert.equal((await db.collection("secrets").findOne({ _id: "legacy-2" })).value, "legacy-plaintext");

  // Apply.
  const done = await migrateSecrets(db, { apply: true });
  assert.equal(done.stamped, 1);
  assert.equal(done.encryptedFromPlaintext, 1);

  const plain = await db.collection("secrets").findOne({ _id: "legacy-2" });
  assert.ok(!JSON.stringify(plain).includes("legacy-plaintext"));
  for (const [id, expected] of [["legacy-1", "legacy-encrypted"], ["legacy-2", "legacy-plaintext"]]) {
    const res = await call(secretRoute.GET, req("GET"), { ...S(), secretId: id });
    assert.equal(res.body.secret.value, expected);
  }

  // The unverifiable record is left exactly as it was, not deleted.
  const bad = await db.collection("secrets").findOne({ _id: "legacy-3" });
  assert.ok(bad && bad.value.v === undefined);

  // Idempotent.
  const again = await migrateSecrets(db, { apply: true });
  assert.equal(again.stamped + again.encryptedFromPlaintext, 0);
});

test("deleting a project removes its secrets", async () => {
  as("user_A");
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: project.id })).status, 200);
  assert.equal(await db.collection("secrets").countDocuments({ projectId: project.id }), 0);
});
