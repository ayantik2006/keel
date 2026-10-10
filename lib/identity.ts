import "server-only";
import { currentUser } from "@clerk/nextjs/server";

export type Identity = {
  /** Display name, if the account has one. */
  name?: string;
  /** Verified email addresses, lowercased. */
  emails: string[];
  primaryEmail?: string;
};

/** Reads the signed-in user's verified emails from the auth provider. */
export async function getIdentity(): Promise<Identity> {
  const user = await currentUser();
  if (!user) return { emails: [] };

  const verified = user.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase());
  const primary = user.primaryEmailAddress?.emailAddress.toLowerCase();
  return {
    name: user.fullName?.trim() || undefined,
    emails: verified,
    primaryEmail:
      primary && verified.includes(primary) ? primary : verified[0],
  };
}
