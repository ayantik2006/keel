import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { noIndex } from "@/lib/site";
import SecretsDashboard from "./SecretsDashboard";

export const metadata: Metadata = { title: "Dashboard", ...noIndex };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await auth.protect();
  const params = await searchParams;

  // Raw strings: the client validates them against its own allowlists.
  return (
    <SecretsDashboard
      initial={{
        view: first(params.view),
        section: first(params.section),
        project: first(params.project),
      }}
    />
  );
}
