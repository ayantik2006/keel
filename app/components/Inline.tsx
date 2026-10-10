import type { ReactNode } from "react";
import Link from "next/link";

const TOKEN = /\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/g;

/** Renders `[label](href)`, `code` and **bold** in a content string. */
export default function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      out.push(
        href.startsWith("/") ? (
          <Link key={key++} href={href}>
            {m[1]}
          </Link>
        ) : (
          <a key={key++} href={href} rel="noopener">
            {m[1]}
          </a>
        ),
      );
    } else if (m[3] !== undefined) {
      out.push(
        <code
          key={key++}
          className="bg-code px-1 py-0.5 font-mono text-[0.88em] text-ink"
        >
          {m[3]}
        </code>,
      );
    } else {
      out.push(<strong key={key++}>{m[4]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
