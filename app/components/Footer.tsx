import Link from "next/link";
import Divider from "./Divider";
import { Logo } from "./Logo";

export default function Footer() {
  return (
    <footer>
      <Divider />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <Logo className="-ml-1 h-7" />
            <span aria-hidden="true" className="h-4 w-px bg-border" />
            <p className="text-[12px] text-muted">
              A <span className="font-medium text-ink">HoardSpace</span> product
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/features" className="text-[12px] text-muted hover:opacity-60">
              Features
            </Link>
            <Link href="/docs" className="text-[12px] text-muted hover:opacity-60">
              Docs
            </Link>
            <Link href="/blog" className="text-[12px] text-muted hover:opacity-60">
              Blog
            </Link>
            <Link href="/privacy" className="text-[12px] text-muted hover:opacity-60">
              Privacy
            </Link>
            <Link href="/terms" className="text-[12px] text-muted hover:opacity-60">
              Terms
            </Link>
            <span className="text-[12px] text-muted">© 2026 HoardSpace</span>
          </div>
        </div>
      </div>
      <Divider />
    </footer>
  );
}
