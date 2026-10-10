import type { DocBlock, CalloutKind } from "@/lib/docs/markdown";
import { highlight, type TokenKind } from "@/lib/docs/highlight";
import Inline from "@/app/components/Inline";
import CopyButton from "./CopyButton";

const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-muted italic",
  string: "text-[#0f6b3a]",
  keyword: "text-[#a8480f]",
  number: "text-[#1d4ed8]",
  prop: "text-[#6d28d9]",
  plain: "",
};

const LANG_LABEL: Record<string, string> = {
  bash: "Shell",
  sh: "Shell",
  shell: "Shell",
  powershell: "PowerShell",
  json: "JSON",
  http: "HTTP",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  env: ".env",
  dotenv: ".env",
  gitignore: ".gitignore",
  text: "Text",
};

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const tokens = highlight(code, lang);
  return (
    <figure className="!my-6 border border-border bg-code">
      <figcaption className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[12px] text-muted">
          {LANG_LABEL[lang] ?? lang}
        </span>
        <CopyButton text={code} />
      </figcaption>
      <pre
        tabIndex={0}
        className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      >
        <code>
          {tokens.map((t, i) =>
            t.kind === "plain" ? (
              t.text
            ) : (
              <span key={i} className={TOKEN_CLASS[t.kind]}>
                {t.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}

const CALLOUT_STYLE: Record<CalloutKind, string> = {
  note: "border-border bg-code",
  warning: "border-accent bg-accent-soft",
  security: "border-ink bg-background",
  planned: "border-dashed border-[#B8B8B2] bg-background",
};

function Callout({
  kind,
  title,
  paras,
}: {
  kind: CalloutKind;
  title: string;
  paras: string[];
}) {
  return (
    <aside
      role="note"
      aria-label={title}
      className={`!my-6 border border-l-4 px-4 py-3 text-[14px] leading-relaxed ${CALLOUT_STYLE[kind]}`}
    >
      <p className="!mt-0 text-[12px] font-semibold uppercase tracking-wider text-ink">
        {title}
      </p>
      {paras.map((p, i) => (
        <p key={i} className="mt-1.5 text-muted">
          <Inline text={p} />
        </p>
      ))}
    </aside>
  );
}

export default function DocContent({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_code]:break-words [&_strong]:font-medium [&_strong]:text-ink">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading": {
            const H = b.level === 2 ? "h2" : "h3";
            return (
              <H
                key={i}
                id={b.id}
                className={`group scroll-mt-24 font-semibold tracking-tight text-ink ${
                  b.level === 2
                    ? "!mt-12 border-t border-border pt-8 text-[22px]"
                    : "!mt-8 text-[17px]"
                }`}
              >
                <Inline text={b.text} />
                <a
                  href={`#${b.id}`}
                  aria-label={`Link to section: ${b.text}`}
                  className="ml-2 !no-underline text-muted opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  #
                </a>
              </H>
            );
          }
          case "p":
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-5">
                {b.items.map((t, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={t} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1.5 pl-5">
                {b.items.map((t, j) => (
                  <li key={j} className="pl-1">
                    <Inline text={t} />
                  </li>
                ))}
              </ol>
            );
          case "code":
            return <CodeBlock key={i} lang={b.lang} code={b.code} />;
          case "table":
            return (
              <div
                key={i}
                className="!my-6 overflow-x-auto border border-border"
                tabIndex={0}
                role="region"
                aria-label="Table"
              >
                <table className="w-full min-w-max border-collapse text-left text-[14px]">
                  <thead className="bg-code text-ink">
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} scope="col" className="border-b border-border px-3 py-2 font-medium">
                          <Inline text={h} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="align-top">
                        {row.map((cell, c) => (
                          <td key={c} className="border-t border-border px-3 py-2">
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout":
            return <Callout key={i} kind={b.kind} title={b.title} paras={b.paras} />;
        }
      })}
    </div>
  );
}
