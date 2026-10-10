import type { Metadata } from "next";
import { noIndex } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in", ...noIndex };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
