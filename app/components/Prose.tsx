import type { Block } from "@/lib/content/types";
import Inline from "./Inline";

/** Long-form body renderer shared by feature pages and articles. */
export default function Prose({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4 text-[16px] leading-[1.75] text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_strong]:font-medium [&_strong]:text-ink">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return (
              <h2
                key={i}
                className="!mt-12 text-[24px] font-semibold tracking-tight text-ink"
              >
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={i}
                className="!mt-8 text-[18px] font-semibold tracking-tight text-ink"
              >
                {b.text}
              </h3>
            );
          case "p":
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-2 pl-5">
                {b.items.map((t, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={t} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-2 pl-5">
                {b.items.map((t, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={t} />
                  </li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre
                key={i}
                tabIndex={0}
                className="overflow-x-auto border border-border bg-code p-4 font-mono text-[13px] leading-relaxed text-ink"
              >
                <code>{b.code}</code>
              </pre>
            );
          case "note":
            return (
              <p
                key={i}
                className="border-l-2 border-accent bg-accent-soft px-4 py-3 text-ink"
              >
                <Inline text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
