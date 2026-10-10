// RBAC integration tests against a throwaway MongoDB database. Clerk is
// stubbed (scripts/ts-loader): globalThis.__testUser picks the acting user and
// globalThis.__testEmails maps users to verified email addresses.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { MongoClient } from "mongodb";

const TEST_URI = "mongodb://127.0.0.1:27017/keel_rbac_test";
process.env.MONGODB_URI = process.env.TEST_RBAC_MONGODB_URI ?? TEST_URI;
assert.match(new URL(process.env.MONGODB_URI).pathname, /_test$/);
process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

const A = "/../app/api"; // keeps editors happy about relative paths
const route = (p) => import(`../app/api/${p}`);
const projectsRoute = await route("projects/route.ts");
const projectRoute = await route("projects/[projectId]/route.ts");
const secretsRoute = await route("projects/[projectId]/environments/[env]/secrets/route.ts");
const secretRoute = await route("projects/[projectId]/environments/[env]/secrets/[secretId]/route.ts");
const membersRoute = await route("projects/[projectId]/members/route.ts");
const memberRoute = await route("projects/[projectId]/members/[userId]/route.ts");
const invitesRoute = await route("projects/[projectId]/invitations/route.ts");
const inviteRoute = await route("projects/[projectId]/invitations/[invitationId]/route.ts");
const acceptRoute = await route("invitations/accept/route.ts");
const accessRoute = await route("projects/[projectId]/environments/[env]/access/[userId]/route.ts");
const { can, permissionsFor, ROLES } = await import("../lib/permissions.ts");
const { migrateRbac } = await import("../lib/migrate-rbac.ts");

globalThis.__testEmails = {
  owner: ["owner@corp.test"],
  admin: ["admin@corp.test"],
  member: ["member@corp.test"],
  viewer: ["viewer@corp.test"],
  stranger: ["stranger@corp.test"],
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

let client, db, P, Q;
const SEC = "super-secret-plaintext-123";
let secretId;

const invite = async (actor, projectId, email, role) => {
  as(actor);
  return call(invitesRoute.POST, req("POST", { email, role }), { projectId });
};
const tokenOf = (res) => res.body.devAcceptUrl.split("#")[1];
const accept = async (user, token) => {
  as(user);
  return call(acceptRoute.POST, req("POST", { token }));
};
const audit = (filter) => db.collection("audit_logs").find(filter).toArray();

before(async () => {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();
  await db.dropDatabase();
});
after(async () => {
  await db.dropDatabase();
  await client.close();
  process.exit(0);
});

test("permission matrix", () => {
  const expected = {
    viewer: ["project:read", "members:read", "secrets:read"],
    member: ["secrets:create", "secrets:update", "secrets:delete"],
    admin: ["project:update", "members:invite", "members:update_role", "members:remove", "invitations:read", "invitations:revoke", "environments:manage", "audit:read", "integrations:manage"],
    owner: ["project:delete"],
  };
  assert.deepEqual(ROLES, ["owner", "admin", "member", "viewer"]);
  let granted = new Set();
  for (const role of ["viewer", "member", "admin", "owner"]) {
    for (const p of expected[role]) granted.add(p);
    assert.deepEqual(new Set(permissionsFor(role)), new Set(granted), role);
  }
  assert.equal(can("admin", "project:delete"), false);
  assert.equal(can("member", "members:invite"), false);
  assert.equal(can("viewer", "secrets:create"), false);
  assert.equal(can("owner", "project:delete"), true);
  assert.equal(can("nobody", "project:read"), false);
});

test("creating a project makes the creator its owner and audits it", async () => {
  as("owner");
  const res = await call(projectsRoute.POST, req("POST", { name: "Alpha", environments: ["development", "production"] }));
  assert.equal(res.status, 201);
  P = res.body.project.id;
  assert.equal(res.body.project.role, "owner");
  assert.ok(res.body.project.permissions.includes("project:delete"));
  const m = await db.collection("project_memberships").find({ projectId: P }).toArray();
  assert.equal(m.length, 1);
  assert.equal(m[0].userId, "owner");
  assert.equal(m[0].email, "owner@corp.test");
  assert.equal((await audit({ projectId: P, action: "project.created" })).length, 1);

  const other = await call(projectsRoute.POST, req("POST", { name: "Beta", environments: ["development"] }));
  Q = other.body.project.id;
});

test("invitations: create, token stored only as a hash, no token in listing", async () => {
  const bad = await invite("owner", P, "not-an-email", "member");
  assert.equal(bad.status, 400);
  const badRole = await invite("owner", P, "admin@corp.test", "owner");
  assert.equal(badRole.status, 400);

  const res = await invite("owner", P, "Admin@Corp.test", "admin");
  assert.equal(res.status, 201);
  const token = tokenOf(res);
  const stored = await db.collection("project_invitations").findOne({ _id: res.body.invitation.id });
  assert.equal(stored.email, "admin@corp.test");
  assert.equal(stored.tokenHash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.ok(stored.expiresAt.getTime() > Date.now() + 6 * 864e5);

  const dup = await invite("owner", P, "admin@corp.test", "viewer");
  assert.equal(dup.status, 409);

  as("owner");
  const list = await call(invitesRoute.GET, req("GET"), { projectId: P });
  assert.equal(list.body.invitations.length, 1);
  assert.ok(!JSON.stringify(list.body).includes(token));
  assert.ok(!JSON.stringify(list.body).includes("tokenHash"));
  assert.equal((await audit({ projectId: P, action: "invitation.created" })).length, 1);

  const ok = await accept("admin", token);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.role, "admin");
});

test("invitation security: reuse, wrong email, unknown token", async () => {
  const res = await invite("owner", P, "member@corp.test", "member");
  const token = tokenOf(res);

  // wrong verified email
  const wrong = await accept("stranger", token);
  assert.equal(wrong.status, 403);
  assert.equal(
    await db.collection("project_memberships").countDocuments({ projectId: P, userId: "stranger" }),
    0,
  );
  // still usable by the right person
  assert.equal((await accept("member", token)).status, 200);
  // single use
  assert.equal((await accept("member", token)).status, 410);
  assert.equal((await accept("outsider", token)).status, 410);
  // unknown / malformed
  assert.equal((await accept("member", randomBytes(32).toString("base64url"))).status, 410);
  assert.equal((await accept("member", "short")).status, 400);
  assert.equal((await accept("member", { $ne: "x" })).status, 400);
  as(null);
  assert.equal((await call(acceptRoute.POST, req("POST", { token }))).status, 401);
});

test("invitation security: expiry and revocation", async () => {
  const exp = await invite("owner", P, "viewer@corp.test", "viewer");
  await db.collection("project_invitations").updateOne(
    { _id: exp.body.invitation.id },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  assert.equal((await accept("viewer", tokenOf(exp))).status, 410);
  as("owner");
  const listed = await call(invitesRoute.GET, req("GET"), { projectId: P });
  assert.equal(listed.body.invitations.find((i) => i.id === exp.body.invitation.id).expired, true);

  // an expired pending invite does not block a fresh one
  const fresh = await invite("owner", P, "viewer@corp.test", "viewer");
  assert.equal(fresh.status, 201);

  // revoke
  as("owner");
  const rev = await call(inviteRoute.DELETE, req("DELETE"), { projectId: P, invitationId: fresh.body.invitation.id });
  assert.equal(rev.status, 200);
  assert.equal((await accept("viewer", tokenOf(fresh))).status, 410);
  assert.equal((await call(inviteRoute.DELETE, req("DELETE"), { projectId: P, invitationId: fresh.body.invitation.id })).status, 404);
  assert.equal((await audit({ projectId: P, action: "invitation.revoked" })).length, 1);

  // finally add the viewer for later tests
  const again = await invite("owner", P, "viewer@corp.test", "viewer");
  assert.equal((await accept("viewer", tokenOf(again))).status, 200);
  assert.equal((await audit({ projectId: P, action: "invitation.accepted" })).length, 3);
});

test("audit entries never contain tokens or secret values", async () => {
  const all = JSON.stringify(await audit({}));
  assert.ok(!all.includes("tokenHash"));
  assert.ok(!all.includes("devAcceptUrl"));
  assert.ok(!/[A-Za-z0-9_-]{43}/.test(all.replace(/[0-9a-f-]{36}/g, "")));
});

test("secrets: each role's allowed and denied operations", async () => {
  const S = { projectId: P, env: "development" };
  // members and viewers need an explicit environment grant (see env-access tests)
  as("owner");
  for (const userId of ["member", "viewer"]) {
    const g = await call(accessRoute.PUT, req("PUT"), { projectId: P, env: "development", userId });
    assert.equal(g.status, 200);
  }
  const create = (u, key = "K_" + randomBytes(3).toString("hex")) => {
    as(u);
    return call(secretsRoute.POST, req("POST", { key, value: SEC }), S);
  };

  // viewers cannot create
  assert.equal((await create("viewer")).status, 403);
  // outsiders get 404
  assert.equal((await create("outsider")).status, 404);
  // member, admin, owner can create
  const made = await create("member", "DB_URL");
  assert.equal(made.status, 201);
  secretId = made.body.secret.id;
  assert.equal((await create("admin")).status, 201);
  assert.equal((await create("owner")).status, 201);

  const SS = { ...S, secretId };
  for (const user of ["viewer", "member", "admin", "owner"]) {
    as(user);
    assert.equal((await call(secretsRoute.GET, req("GET"), S)).status, 200, user);
    const v = await call(secretRoute.GET, req("GET"), SS);
    assert.equal(v.body.secret.value, SEC, user);
  }

  // viewer: cannot update or delete
  as("viewer");
  assert.equal((await call(secretRoute.PATCH, req("PATCH", { value: "x" }), SS)).status, 403);
  assert.equal((await call(secretRoute.DELETE, req("DELETE"), SS)).status, 403);
  // member can update
  as("member");
  assert.equal((await call(secretRoute.PATCH, req("PATCH", { value: "member-updated" }), SS)).status, 200);
  as("owner");
  assert.equal((await call(secretRoute.GET, req("GET"), SS)).body.secret.value, "member-updated");
  // still encrypted at rest
  const raw = await db.collection("secrets").findOne({ _id: secretId });
  assert.ok(!JSON.stringify(raw).includes("member-updated"));
  assert.equal(raw.value.v, 1);
});

test("outsiders and non-members never reach secrets or values", async () => {
  const SS = { projectId: P, env: "development", secretId };
  as("outsider");
  const r = [
    await call(secretsRoute.GET, req("GET"), { projectId: P, env: "development" }),
    await call(secretRoute.GET, req("GET"), SS),
    await call(secretRoute.PATCH, req("PATCH", { value: "x" }), SS),
    await call(secretRoute.DELETE, req("DELETE"), SS),
  ];
  for (const res of r) {
    assert.equal(res.status, 404);
    assert.ok(!JSON.stringify(res.body).includes(SEC));
  }
});

test("cross-project: membership in one project grants nothing in another", async () => {
  // 'member' belongs to P but not Q. Q's id with P's secret id must not resolve.
  as("member");
  assert.equal((await call(projectRoute.GET, req("GET"), { projectId: Q })).status, 404);
  assert.equal((await call(secretsRoute.GET, req("GET"), { projectId: Q, env: "development" })).status, 404);
  assert.equal((await call(secretRoute.GET, req("GET"), { projectId: Q, env: "development", secretId })).status, 404);
  assert.equal((await call(membersRoute.GET, req("GET"), { projectId: Q })).status, 404);
  assert.equal((await call(invitesRoute.GET, req("GET"), { projectId: Q })).status, 404);

  // even an owner of Q cannot reach P's secret through Q's id
  as("owner");
  assert.equal((await call(secretRoute.GET, req("GET"), { projectId: Q, env: "development", secretId })).status, 404);

  // project list only contains projects the user belongs to
  as("viewer");
  const list = await call(projectsRoute.GET, req("GET"));
  assert.deepEqual(list.body.projects.map((p) => p.id), [P]);
  assert.equal(list.body.projects[0].role, "viewer");
  assert.ok(!list.body.projects[0].permissions.includes("secrets:create"));
});

test("project settings and deletion by role", async () => {
  for (const user of ["viewer", "member"]) {
    as(user);
    assert.equal((await call(projectRoute.PATCH, req("PATCH", { name: "x" }), { projectId: P })).status, 403, user);
  }
  as("admin");
  const ren = await call(projectRoute.PATCH, req("PATCH", { name: "Alpha 2" }), { projectId: P });
  assert.equal(ren.status, 200);
  assert.equal(ren.body.project.role, "admin");
  // admin cannot delete
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 403);
  for (const user of ["member", "viewer"]) {
    as(user);
    assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 403, user);
  }
  as("outsider");
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 404);
});

test("member management is restricted to admins and owners", async () => {
  // everyone in the project can list members; outsiders cannot
  for (const user of ["viewer", "member", "admin", "owner"]) {
    as(user);
    const res = await call(membersRoute.GET, req("GET"), { projectId: P });
    assert.equal(res.status, 200, user);
    assert.equal(res.body.members.length, 4);
  }
  // viewers and members cannot invite, see invitations, or change roles
  for (const user of ["viewer", "member"]) {
    assert.equal((await invite(user, P, "x@corp.test", "viewer")).status, 403, user);
    as(user);
    assert.equal((await call(invitesRoute.GET, req("GET"), { projectId: P })).status, 403);
    assert.equal((await call(memberRoute.PATCH, req("PATCH", { role: "admin" }), { projectId: P, userId: user })).status, 403);
    assert.equal((await call(memberRoute.DELETE, req("DELETE"), { projectId: P, userId: "viewer" })).status, user === "viewer" ? 200 : 403);
    if (user === "viewer") {
      // viewer left; bring them back for later tests
      const back = await invite("owner", P, "viewer@corp.test", "viewer");
      assert.equal((await accept("viewer", tokenOf(back))).status, 200);
    }
  }
});

test("role changes and member removal are enforced and audited", async () => {
  as("admin");
  // admin promotes the member to admin, then back to viewer
  const up = await call(memberRoute.PATCH, req("PATCH", { role: "viewer" }), { projectId: P, userId: "member" });
  assert.equal(up.status, 200);
  // the change takes effect immediately
  as("member");
  assert.equal(
    (await call(secretsRoute.POST, req("POST", { key: "NOPE", value: "x" }), { projectId: P, env: "development" })).status,
    403,
  );
  const changed = await audit({ projectId: P, action: "member.role_changed" });
  assert.equal(changed.length, 1);
  assert.deepEqual(
    [changed[0].actorId, changed[0].targetId, changed[0].metadata.from, changed[0].metadata.to],
    ["admin", "member", "member", "viewer"],
  );

  // owner is protected from everyone, including admins
  as("admin");
  assert.equal((await call(memberRoute.PATCH, req("PATCH", { role: "viewer" }), { projectId: P, userId: "owner" })).status, 403);
  assert.equal((await call(memberRoute.DELETE, req("DELETE"), { projectId: P, userId: "owner" })).status, 403);
  // cannot assign owner or change own role
  assert.equal((await call(memberRoute.PATCH, req("PATCH", { role: "owner" }), { projectId: P, userId: "viewer" })).status, 400);
  assert.equal((await call(memberRoute.PATCH, req("PATCH", { role: "viewer" }), { projectId: P, userId: "admin" })).status, 400);
  // unknown user
  assert.equal((await call(memberRoute.PATCH, req("PATCH", { role: "viewer" }), { projectId: P, userId: "ghost" })).status, 404);

  // removal
  const rm = await call(memberRoute.DELETE, req("DELETE"), { projectId: P, userId: "member" });
  assert.equal(rm.status, 200);
  as("member");
  assert.equal((await call(projectRoute.GET, req("GET"), { projectId: P })).status, 404);
  assert.equal((await call(secretRoute.GET, req("GET"), { projectId: P, env: "development", secretId })).status, 404);
  assert.equal((await audit({ projectId: P, action: "member.removed" })).length, 1);

  // owner cannot leave
  as("owner");
  assert.equal((await call(memberRoute.DELETE, req("DELETE"), { projectId: P, userId: "owner" })).status, 403);
});

test("legacy projects: migration gives only the recorded owner access", async () => {
  const now = new Date();
  await db.collection("projects").insertOne({
    _id: "legacy-p", ownerId: "owner", name: "Legacy", nameLower: "legacy", createdAt: now, updatedAt: now,
  });
  await db.collection("environments").insertOne({
    _id: "legacy-e", projectId: "legacy-p", slug: "development", name: "Development", createdAt: now,
  });

  // before migration nobody (not even the recorded owner) has access
  as("owner");
  assert.equal((await call(projectRoute.GET, req("GET"), { projectId: "legacy-p" })).status, 404);

  const dry = await migrateRbac(db, { apply: false });
  assert.equal(dry.ownerMembershipsCreated, 1);
  assert.equal(await db.collection("project_memberships").countDocuments({ projectId: "legacy-p" }), 0);

  await migrateRbac(db, { apply: true });
  const ms = await db.collection("project_memberships").find({ projectId: "legacy-p" }).toArray();
  assert.deepEqual(ms.map((m) => [m.userId, m.role]), [["owner", "owner"]]);
  assert.equal((await call(projectRoute.GET, req("GET"), { projectId: "legacy-p" })).status, 200);

  as("admin"); // a user of other projects gets nothing
  assert.equal((await call(projectRoute.GET, req("GET"), { projectId: "legacy-p" })).status, 404);

  assert.equal((await migrateRbac(db, { apply: true })).ownerMembershipsCreated, 0);
});

test("unauthenticated requests are rejected everywhere", async () => {
  as(null);
  const p = { projectId: P };
  for (const [fn, r, params] of [
    [projectsRoute.GET, req("GET"), {}],
    [membersRoute.GET, req("GET"), p],
    [invitesRoute.POST, req("POST", { email: "a@b.co", role: "viewer" }), p],
    [memberRoute.DELETE, req("DELETE"), { ...p, userId: "x" }],
  ]) {
    assert.equal((await call(fn, r, params)).status, 401);
  }
});

test("deleting a project removes memberships and invitations", async () => {
  as("owner");
  assert.equal((await call(projectRoute.DELETE, req("DELETE"), { projectId: P })).status, 200);
  for (const c of ["project_memberships", "project_invitations", "secrets", "environments"]) {
    assert.equal(await db.collection(c).countDocuments({ projectId: P }), 0, c);
  }
  assert.ok((await audit({ projectId: P })).length > 0, "audit history is kept");
  void A;
});
