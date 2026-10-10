import Footer from "@/app/components/Footer";
import { ALL_SLUGS } from "@/lib/docs/nav";
import { loadDoc } from "@/lib/docs/load";
import DocsHeader from "./_components/DocsHeader";
import SidebarNav from "./_components/SidebarNav";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  const titles = Object.fromEntries(ALL_SLUGS.map((s) => [s, loadDoc(s).title]));

  return (
    // Opaque and above the site's decorative side rails.
    <div className="relative z-10 min-h-screen bg-background">
      <a
        href="#docs-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-[60] focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <DocsHeader titles={titles} />
      <div className="mx-auto flex max-w-[88rem] px-6">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-4 lg:block">
          <SidebarNav titles={titles} />
        </aside>
        <main id="docs-main" className="min-w-0 flex-1 lg:border-l lg:border-border lg:pl-10">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
