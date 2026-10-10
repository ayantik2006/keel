import Link from "next/link";

export type CardItem = { href: string; title: string; text: string };

/** Crawlable list of cards used for related pages and index pages. */
export default function CardList({ items }: { items: CardItem[] }) {
  return (
    <ul className="grid gap-px border border-border bg-border sm:grid-cols-2">
      {items.map((c) => (
        <li key={c.href} className="bg-background">
          <Link
            href={c.href}
            className="block h-full p-5 transition-colors hover:bg-code"
          >
            <span className="block text-[16px] font-semibold tracking-tight">
              {c.title}
            </span>
            <span className="mt-1.5 block text-[14px] leading-relaxed text-muted">
              {c.text}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
