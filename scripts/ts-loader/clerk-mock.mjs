// Test stand-in for Clerk. Tests set globalThis.__testUser to act as a user and
// globalThis.__testEmails = { user_id: ["a@b.c"] } for verified emails.
const actingUser = () =>
  globalThis.__testALS?.getStore()?.user ?? globalThis.__testUser ?? null;

export async function auth() {
  return { userId: actingUser() };
}

export async function currentUser() {
  const id = actingUser();
  if (!id) return null;
  const emails = globalThis.__testEmails?.[id] ?? [`${id}@example.com`];
  const list = emails.map((emailAddress) => ({
    emailAddress,
    verification: { status: "verified" },
  }));
  return {
    id,
    fullName: globalThis.__testNames?.[id] ?? null,
    emailAddresses: list,
    primaryEmailAddress: list[0],
  };
}
