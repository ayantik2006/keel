"use client";

import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";
import EncryptedText from "./EncryptedText";

/** Auth-dependent hero buttons, kept client-side so the hero page stays static. */
export default function HeroActions() {
  return (
    <>
      <Show when="signed-out">
        <SignUpButton mode="modal">
          <button className="inline-flex items-center gap-1.5 bg-ink px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent">
            <EncryptedText text="Get started for free" />
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 bg-ink px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent"
        >
          <EncryptedText text="Go to dashboard" />
        </Link>
      </Show>
    </>
  );
}
