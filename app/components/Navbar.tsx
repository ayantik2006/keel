"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Show, SignUpButton, UserButton } from "@clerk/nextjs";
import GitHubIcon from "./GitHubIcon";
import { Logo } from "./Logo";
import { GITHUB_URL } from "@/lib/site";
import Divider from "./Divider";
import EncryptedText from "./EncryptedText";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  // While the full-screen menu is open: lock page scroll, close on Escape,
  // and close if the viewport grows to the desktop layout.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = () => query.matches && setOpen(false);
    window.addEventListener("keydown", onKey);
    query.addEventListener("change", onChange);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      query.removeEventListener("change", onChange);
    };
  }, [open]);

  return (
    <>
    <header
      className={`sticky top-0 z-50 backdrop-blur-sm transition-colors ${
        open ? "bg-background" : "bg-background/90"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Keel home" className="-ml-1 flex items-center">
          <Logo className="h-8" />
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          <nav aria-label="Primary" className="flex items-center gap-5">
            <Link
              href="/"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Home
            </Link>
            <Link
              href="/features"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Features
            </Link>
            <Link
              href="/docs"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Docs
            </Link>
            <Link
              href="/blog"
              className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
            >
              Blog
            </Link>
          </nav>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="text-muted transition-opacity hover:opacity-60"
          >
            <GitHubIcon className="h-5 w-5" />
          </a>
          <Link
            href="/contact"
            className="inline-flex items-center gap-1.5 border border-[#B8B8B2] px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink"
          >
            Contact us
          </Link>
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="inline-flex items-center gap-1.5 bg-ink px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent">
                <EncryptedText text="Get started for free" />
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <div className="flex flex-col gap-[5px]">
            <span
              className={`h-px w-5 bg-ink transition-transform duration-200 ${open ? "translate-y-[3px] rotate-45" : ""}`}
            />
            <span
              className={`h-px w-5 bg-ink transition-transform duration-200 ${open ? "-translate-y-[3px] -rotate-45" : ""}`}
            />
          </div>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <Divider />
      </div>

    </header>

    {/* A sibling of the header: its backdrop blur would otherwise trap a fixed child. */}
    {open && (
      <div
        id="mobile-menu"
        className="fixed inset-x-0 bottom-0 top-16 z-40 flex animate-view-in flex-col overflow-y-auto bg-background motion-reduce:animate-none md:hidden"
      >
        <nav aria-label="Main" className="flex flex-1 flex-col px-6 pt-2">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border py-5 text-[18px] font-medium"
          >
            Home
            <span aria-hidden="true" className="text-muted">
              &rarr;
            </span>
          </Link>
          <Link
            href="/features"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border py-5 text-[18px] font-medium"
          >
            Features
            <span aria-hidden="true" className="text-muted">
              &rarr;
            </span>
          </Link>
          <Link
            href="/docs"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border py-5 text-[18px] font-medium"
          >
            Docs
            <span aria-hidden="true" className="text-muted">
              &rarr;
            </span>
          </Link>
          <Link
            href="/blog"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border py-5 text-[18px] font-medium"
          >
            Blog
            <span aria-hidden="true" className="text-muted">
              &rarr;
            </span>
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border-b border-border py-5 text-[18px] font-medium"
          >
            <GitHubIcon className="h-5 w-5 text-muted" />
            GitHub
          </a>
          <Link
            href="/contact"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between border-b border-border py-5 text-[18px] font-medium"
          >
            Contact us
            <span aria-hidden="true" className="text-muted">
              &rarr;
            </span>
          </Link>
        </nav>

        <div className="border-t border-border px-6 py-6">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button className="w-full bg-ink px-5 py-3 text-[15px] font-medium text-white transition-colors hover:bg-accent">
                Get started for free
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <div className="flex items-center gap-3">
              <UserButton />
              <span className="text-[14px] text-muted">Your account</span>
            </div>
          </Show>
        </div>
      </div>
    )}
    </>
  );
}
