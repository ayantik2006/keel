"use client";

import Link from "next/link";
import { Show, SignUpButton } from "@clerk/nextjs";

/** Closing call to action for feature and article pages. */
export default function PageCta({
  heading = "Try Keel with your next project",
  body = "Create a project, import your .env file, and invite your team.",
}: {
  heading?: string;
  body?: string;
}) {
  return (
    <aside className="mt-16 border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-[20px] font-semibold tracking-tight">{heading}</h2>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        {body}
      </p>
      <div className="mt-5">
        <Show when="signed-out">
          <SignUpButton mode="modal">
            <button className="bg-ink px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent">
              Get started for free
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <Link
            href="/dashboard"
            className="inline-block bg-ink px-5 py-2 text-[14px] font-medium text-white transition-colors hover:bg-accent"
          >
            Go to dashboard
          </Link>
        </Show>
      </div>
    </aside>
  );
}
