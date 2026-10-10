"use client";

import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";
import GitHubIcon from "./GitHubIcon";
import Divider from "./Divider";
import EncryptedText from "./EncryptedText";

export default function FinalCTA() {
  return (
    <section>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-28 text-center">
        <h2 className="text-balance text-[36px] font-semibold tracking-tight sm:text-[52px]">
          Stop passing secrets around.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-relaxed text-muted">
          Give your infrastructure a single source of truth.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
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
          <a
            href="#"
            className="inline-flex items-center gap-2 border border-[#B8B8B2] px-5 py-2 text-[14px] font-medium text-ink transition-colors hover:border-ink"
          >
            <GitHubIcon className="h-4 w-4" />
            View GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
