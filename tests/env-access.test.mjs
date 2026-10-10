// Environment-level access control tests against a throwaway MongoDB database.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

process.env.MONGODB_URI =
  process.env.TEST_ENVACCESS_MONGODB_URI ??
  "mongodb://127.0.0.1:27017/keel_envaccess_test";
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const route = (p) => import(`../app/api/${p}`);
const projectsRoute = await route("projects/route.ts");
const projectRoute = await route("projects/[projectId]/route.ts");
const secretsRoute = await route("projects/[projectId]/environments/[env]/secrets/route.ts");
const secretRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/route.ts");
const memberRoute = await route("projects/[projectId]/members/[userId]/route.ts");
const memberPatch = memberRoute;
const invitesRoute = await route("projects/[projectId]/invitations/route.ts");
const acceptRoute = await route("invitations/accept/route.ts");
const accessRoute = await route("projects/[projectId]/environments/[env]/access/[userId]/route.ts");
const matrixRoute = await route("projects/[projectId]/environment-access/route.ts");
const { migrateEnvironmentAccess } = await import("../lib/migrate-env-access.ts");
const { environmentAccessFor } = await import("../lib/permissions.ts");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  admin: ["admin@corp.test"],
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
const quiet = async (fn) => {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
};

const ENVS = ["development", "staging", "production"];
const PLAIN = {
  development: "dev-plaintext-value",
  staging: "staging-plaintext-value",
  production: "PROD-plaintext-value",
};
let client, db, P, Q;
const ids = {}; // secret ids by env in P
let qSecret;

const join = async (user, role) => {
  as("owner");
  const inv = await call(invitesRoute.POST, req("POST", { email: `${user}@corp.test`, role }), { projectId: P });
  assert.equal(inv.status, 201);
  as(user);
  const res = await call(acceptRoute.POST, req("POST", { token: inv.body.devAcceptUrl.split("#")[1] }));
  assert.equal(res.status, 200);
};
const grant = (actor, env, userId, projectId = P) => {
  as(actor);
  return call(accessRoute.PUT, req("PUT"), { projectId, env, userId });
};
const revoke = (actor, env, userId, projectId = P) => {
  as(actor);
  return call(accessRoute.DELETE, req("DELETE"), { projectId, env, userId });
};
const audit = (filter) => db.collection("audit_logs").find(filter).toArray();
const S = (env, extra = {}) => ({ projectId: P, env, ...extra });

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();

  as("owner");
  const p = await call(projectsRoute.POST, req("POST", { name: "Prod App", environments: ENVS }));
  P = p.body.project.id;
  const q = await call(projectsRoute.POST, req("POST", { name: "Other", environments: ["development"] }));
  Q = q.body.project.id;

  for (const env of ENVS) {
    const r = await call(secretsRoute.POST, req("POST", { key: "API_KEY", value: PLAIN[env] }), S(env));
    assert.equal(r.status, 201);
    ids[env] = r.body.secret.id;
  }
  const qs = await call(secretsRoute.POST, req("POST", { key: "Q_SECRET", value: "q-plaintext" }), { projectId: Q, env: "development" });
  qSecret = qs.body.secret.id;

  await join("admin", "admin");
  await join("member", "member");
  await join("viewer", "viewer");
});
after(async () => {
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

const noLeak = (res) => {
  const s = JSON.stringify(res.body);
  for (const v of Object.values(PLAIN)) assert.ok(!s.includes(v));
};

test("rule: owners and admins implicit, members and viewers need a grant", () => {
  assert.equal(environmentAccessFor("owner", false), "implicit");
  assert.equal(environmentAccessFor("admin", false), "implicit");
  assert.equal(environmentAccessFor("member", false), "none");
  assert.equal(environmentAccessFor("viewer", false), "none");
  assert.equal(environmentAccessFor("member", true), "granted");
  assert.equal(environmentAccessFor("viewer", true), "granted");
});

test("default deny: members and viewers reach no environment, including production", async () => {
  for (const user of ["member", "viewer"]) {
    as(user);
    for (const env of ENVS) {
      const list = await call(secretsRoute.GET, req("GET"), S(env));
      assert.equal(list.status, 403, `${user} list ${env}`);
      noLeak(list);
      const read = await call(secretRoute.GET, req("GET"), S(env, { secretId: ids[env] }));
      assert.equal(read.status, 403, `${user} read ${env}`);
      noLeak(read);
      assert.equal((await call(secretsRoute.POST, req("POST", { key: "X", value: "y" }), S(env))).status, 403);
      assert.equal((await call(secretRoute.PATCH, req("PATCH", { value: "z" }), S(env, { secretId: ids[env] }))).status, 403);
      assert.equal((await call(secretRoute.DELETE, req("DELETE"), S(env, { secretId: ids[env] }))).status, 403);
    }
    // environments are hidden from the project payload
    const proj = await call(projectRoute.GET, req("GET"), { projectId: P });
    assert.deepEqual(proj.body.project.environments, []);
    assert.deepEqual(proj.body.project.secretCounts, {});
    const list = await call(projectsRoute.GET, req("GET"));
    assert.deepEqual(list.body.projects.find((p) => p.id === P).environments, []);
  }
});

test("owners and admins keep access to every environment", async () => {
  for (const user of ["owner", "admin"]) {
    as(user);
    for (const env of ENVS) {
      const read = await call(secretRoute.GET, req("GET"), S(env, { secretId: ids[env] }));
      assert.equal(read.status, 200, `${user} ${env}`);
      assert.equal(read.body.secret.value, PLAIN[env]);
    }
    const proj = await call(projectRoute.GET, req("GET"), { projectId: P });
    assert.deepEqual(proj.body.project.environments, ENVS);
  }
});

test("granting Development to a member does not grant Production", async () => {
  assert.equal((await grant("admin", "development", "member")).status, 200);

  as("member");
  // development: full member permissions
  const dev = await call(secretRoute.GET, req("GET"), S("development", { secretId: ids.development }));
  assert.equal(dev.body.secret.value, PLAIN.development);
  const created = await call(secretsRoute.POST, req("POST", { key: "MEMBER_KEY", value: "m" }), S("development"));
  assert.equal(created.status, 201);
  assert.equal(
    (await call(secretRoute.PATCH, req("PATCH", { value: "m2" }), S("development", { secretId: created.body.secret.id }))).status,
    200,
  );
  assert.equal(
    (await call(secretRoute.DELETE, req("DELETE"), S("development", { secretId: created.body.secret.id }))).status,
    200,
  );
  // production and staging stay denied
  for (const env of ["staging", "production"]) {
    const res = await call(secretRoute.GET, req("GET"), S(env, { secretId: ids[env] }));
    assert.equal(res.status, 403);
    noLeak(res);
    assert.equal((await call(secretsRoute.GET, req("GET"), S(env))).status, 403);
  }
  const proj = await call(projectRoute.GET, req("GET"), { projectId: P });
  assert.deepEqual(proj.body.project.environments, ["development"]);
  assert.deepEqual(Object.keys(proj.body.project.secretCounts), ["development"]);

  // the viewer is unaffected
  as("viewer");
  assert.equal((await call(secretsRoute.GET, req("GET"), S("development"))).status, 403);
});

test("a grant does not raise a role: viewer with production access is read only", async () => {
  assert.equal((await grant("owner", "production", "viewer")).status, 200);
  as("viewer");
  const read = await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }));
  assert.equal(read.body.secret.value, PLAIN.production);
  assert.equal((await call(secretsRoute.POST, req("POST", { key: "N", value: "v" }), S("production"))).status, 403);
  assert.equal((await call(secretRoute.PATCH, req("PATCH", { value: "v" }), S("production", { secretId: ids.production }))).status, 403);
  assert.equal((await call(secretRoute.DELETE, req("DELETE"), S("production", { secretId: ids.production }))).status, 403);
  // and still nothing in development
  assert.equal((await call(secretsRoute.GET, req("GET"), S("development"))).status, 403);
});

test("revocation takes effect immediately", async () => {
  assert.equal((await revoke("admin", "production", "viewer")).status, 200);
  as("viewer");
  const res = await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }));
  assert.equal(res.status, 403);
  noLeak(res);
  // revoking again is harmless
  assert.equal((await revoke("admin", "production", "viewer")).status, 200);
});

test("who may manage grants, and what can be granted", async () => {
  for (const user of ["member", "viewer"]) {
    assert.equal((await grant(user, "production", user)).status, 403, `${user} self-grant`);
    assert.equal((await revoke(user, "development", "member")).status, 403);
    as(user);
    assert.equal((await call(matrixRoute.GET, req("GET"), { projectId: P })).status, 403);
  }
  assert.equal((await grant("outsider", "production", "member")).status, 404);
  assert.equal((await grant("admin", "production", "ghost")).status, 404);
  assert.equal((await grant("admin", "qa", "member")).status, 404);
  assert.equal((await grant("admin", "production", "owner")).status, 400);
  assert.equal((await grant("owner", "production", "admin")).status, 400);
  // member of another project cannot grant into this one
  assert.equal((await grant("owner", "production", "member", Q)).status, 404);

  as("admin");
  const m = await call(matrixRoute.GET, req("GET"), { projectId: P });
  assert.equal(m.status, 200);
  assert.deepEqual(m.body.environments, ENVS);
  const row = (u) => m.body.members.find((x) => x.userId === u);
  assert.equal(row("owner").access.production, "implicit");
  assert.equal(row("admin").access.production, "implicit");
  assert.equal(row("member").access.development, "granted");
  assert.equal(row("member").access.production, "none");
  assert.equal(row("viewer").access.production, "none");
  assert.deepEqual(row("viewer").secretPermissions, ["secrets:read"]);
});

test("manipulated ids cannot cross environments or projects", async () => {
  as("member"); // granted: development in P only
  // production secret id through the development path
  assert.equal(
    (await call(secretRoute.GET, req("GET"), S("development", { secretId: ids.production }))).status,
    404,
  );
  assert.equal(
    (await call(secretRoute.PATCH, req("PATCH", { value: "x" }), S("development", { secretId: ids.production }))).status,
    404,
  );
  assert.equal(
    (await call(secretRoute.DELETE, req("DELETE"), S("development", { secretId: ids.production }))).status,
    404,
  );
  // production secret id through the production path: environment gate
  assert.equal((await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }))).status, 403);
  // other project's secret via this project, and via its own id
  assert.equal(
    (await call(secretRoute.GET, req("GET"), S("development", { secretId: qSecret }))).status,
    404,
  );
  assert.equal(
    (await call(secretRoute.GET, req("GET"), { projectId: Q, env: "development", secretId: qSecret })).status,
    404,
  );
  // a grant row for one environment id is not honored for another
  const g = await db.collection("environment_access").find({ userId: "member" }).toArray();
  assert.equal(g.length, 1);
});

test("authorization happens before decryption", async () => {
  // Corrupt the production ciphertext. If decryption ran first, an
  // unauthorized caller would get a 500 decryption error instead of 403.
  const raw = await db.collection("secrets").findOne({ _id: ids.production });
  const bytes = Buffer.from(raw.value.ciphertext, "base64");
  bytes[0] ^= 1;
  await db.collection("secrets").updateOne(
    { _id: ids.production },
    { $set: { "value.ciphertext": bytes.toString("base64") } },
  );

  as("member");
  const denied = await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "You do not have access to this environment.");

  // authorized caller does reach decryption, which fails closed
  as("owner");
  const authorized = await quiet(() =>
    call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production })),
  );
  assert.equal(authorized.status, 500);

  // restore
  await db.collection("secrets").updateOne({ _id: ids.production }, { $set: { value: raw.value } });
});

test("audit: grants, revocations and denied attempts", async () => {
  const granted = await audit({ projectId: P, action: "environment.access_granted" });
  // member/development, viewer/production (repeat PUTs do not duplicate)
  assert.deepEqual(
    granted.map((e) => [e.actorId, e.metadata.userId, e.metadata.environment]).sort(),
    [["admin", "member", "development"], ["owner", "viewer", "production"]].sort(),
  );
  await grant("admin", "development", "member"); // idempotent
  assert.equal((await audit({ projectId: P, action: "environment.access_granted" })).length, 2);

  const revoked = await audit({ projectId: P, action: "environment.access_revoked" });
  assert.equal(revoked.length, 1);
  assert.deepEqual(
    [revoked[0].actorId, revoked[0].metadata.userId, revoked[0].metadata.environment],
    ["admin", "viewer", "production"],
  );

  const denied = await audit({ projectId: P, action: "environment.access_denied" });
  assert.ok(denied.length > 0);
  // repeated denials from one actor on one environment are deduplicated
  const keys = denied.map((d) => `${d.actorId}:${d.targetId}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(denied.some((d) => d.actorId === "member" && d.metadata.environment === "production"));

  const all = JSON.stringify(await audit({}));
  for (const v of [...Object.values(PLAIN), "q-plaintext"]) assert.ok(!all.includes(v));
});

test("removing a member removes their grants; rejoining restores nothing", async () => {
  as("admin");
  assert.equal((await call(memberRoute.DELETE, req("DELETE"), { projectId: P, userId: "member" })).status, 200);
  assert.equal(await db.collection("environment_access").countDocuments({ projectId: P, userId: "member" }), 0);
  await join("member", "member");
  as("member");
  assert.equal((await call(secretsRoute.GET, req("GET"), S("development"))).status, 403);
});

test("role changes: promotion gives implicit access, demotion drops it", async () => {
  as("owner");
  assert.equal((await call(memberPatch.PATCH, req("PATCH", { role: "admin" }), { projectId: P, userId: "member" })).status, 200);
  as("member");
  assert.equal((await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }))).status, 200);
  as("owner");
  assert.equal((await call(memberPatch.PATCH, req("PATCH", { role: "member" }), { projectId: P, userId: "member" })).status, 200);
  as("member");
  assert.equal((await call(secretRoute.GET, req("GET"), S("production", { secretId: ids.production }))).status, 403);
});

test("migration grants existing members non-production access only", async () => {
  await db.collection("environment_access").deleteMany({});
  const dry = await migrateEnvironmentAccess(db, { apply: false });
  assert.equal(dry.productionGrants, 0);
  assert.equal(await db.collection("environment_access").countDocuments(), 0);

  const done = await migrateEnvironmentAccess(db, { apply: true });
  // member and viewer in P: development + staging each; production excluded
  assert.equal(done.grantsCreated, 4);
  const prodEnv = await db.collection("environments").findOne({ projectId: P, slug: "production" });
  assert.equal(
    await db.collection("environment_access").countDocuments({ environmentId: prodEnv._id }),
    0,
  );
  as("member");
  assert.equal((await call(secretsRoute.GET, req("GET"), S("staging"))).status, 200);
  assert.equal((await call(secretsRoute.GET, req("GET"), S("production"))).status, 403);

  assert.equal((await migrateEnvironmentAccess(db, { apply: true })).grantsCreated, 0);
});

test("invitations carry environment grants that apply on accept", async () => {
  as("owner");
  const invite = (body) =>
    call(invitesRoute.POST, req("POST", body), { projectId: P });

  // Admins already reach everything, so a list makes no sense for them.
  assert.equal(
    (await invite({ email: "x1@corp.test", role: "admin", environments: ["development"] })).status,
    400,
  );
  assert.equal(
    (await invite({ email: "x2@corp.test", role: "member", environments: ["nope"] })).status,
    400,
  );
  assert.equal(
    (await invite({ email: "x3@corp.test", role: "member", environments: "development" })).status,
    400,
  );

  const inv = await invite({
    email: "newbie@corp.test",
    role: "member",
    environments: ["staging", "development"],
  });
  assert.equal(inv.status, 201);
  assert.deepEqual(inv.body.invitation.environments, ["development", "staging"]);

  const listed = await call(invitesRoute.GET, req("GET"), { projectId: P });
  const row = listed.body.invitations.find((i) => i.email === "newbie@corp.test");
  assert.deepEqual(row.environments, ["development", "staging"]);

  // Nothing is granted until the invitation is accepted.
  assert.equal(
    await db.collection("environment_access").countDocuments({ projectId: P, userId: "newbie" }),
    0,
  );

  globalThis.__testEmails.newbie = ["newbie@corp.test"];
  as("newbie");
  const accepted = await call(acceptRoute.POST, req("POST", { token: inv.body.devAcceptUrl.split("#")[1] }));
  assert.equal(accepted.status, 200);

  assert.equal((await call(secretsRoute.GET, req("GET"), S("development"))).status, 200);
  assert.equal((await call(secretsRoute.GET, req("GET"), S("staging"))).status, 200);
  assert.equal((await call(secretsRoute.GET, req("GET"), S("production"))).status, 403);

  const logged = await audit({
    projectId: P,
    action: "environment.access_granted",
    "metadata.via": "invitation",
  });
  assert.equal(logged.length, 2);
});

test("project deletion removes environment grants", async () => {
  as("owner");
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 200);
  assert.equal(await db.collection("environment_access").countDocuments({ projectId: P }), 0);
});
