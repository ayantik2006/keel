import { test } from "node:test";
import assert from "node:assert/strict";

const { articles } = await import("../lib/content/articles.ts");
const { features } = await import("../lib/content/features.ts");
const { default: sitemap } = await import("../app/sitemap.ts");
const { default: robots } = await import("../app/robots.ts");
const { pageMetadata, SITE_URL } = await import("../lib/site.ts");
const { ALL_SLUGS } = await import("../lib/docs/nav.ts");

// Routes that exist in app/ and are public. Update with new top-level pages.
const STATIC_ROUTES = new Set(["/", "/features", "/blog", "/contact", "/privacy", "/terms", "/docs"]);
const docSlugs = new Set(ALL_SLUGS);
const articleSlugs = new Set(articles.map((a) => a.slug));
const featureSlugs = new Set(features.map((f) => f.slug));

const routeExists = (path) => {
  const clean = path.split("#")[0];
  if (STATIC_ROUTES.has(clean)) return true;
  const [, section, slug] = clean.split("/");
  if (section === "docs") return docSlugs.has(clean.slice("/docs/".length));
  return (
    (section === "blog" && articleSlugs.has(slug)) ||
    (section === "features" && featureSlugs.has(slug))
  );
};

const textOf = (block) =>
  "text" in block ? [block.text] : "items" in block ? block.items : [];

const allContent = [
  ...articles.map((a) => ({ id: `blog/${a.slug}`, doc: a, texts: a.body.flatMap(textOf) })),
  ...features.map((f) => ({
    id: `features/${f.slug}`,
    doc: f,
    texts: [f.intro, ...f.body.flatMap(textOf), ...f.faq.flatMap((q) => [q.q, q.a])],
  })),
];

test("slugs are unique and metadata is unique and sized for search results", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const { id, doc } of allContent) {
    assert.ok(doc.description.length >= 70 && doc.description.length <= 170, `${id} description length ${doc.description.length}`);
    assert.ok(doc.metaTitle.length <= 55, `${id} metaTitle too long`);
    assert.ok(!titles.has(doc.metaTitle), `${id} duplicate title`);
    assert.ok(!descriptions.has(doc.description), `${id} duplicate description`);
    titles.add(doc.metaTitle);
    descriptions.add(doc.description);
  }
  assert.equal(articleSlugs.size, articles.length);
  assert.equal(featureSlugs.size, features.length);
});

test("related references point at real articles and features", () => {
  for (const { id, doc } of allContent) {
    for (const s of doc.relatedArticles) assert.ok(articleSlugs.has(s), `${id} -> article ${s}`);
    for (const s of doc.relatedFeatures) assert.ok(featureSlugs.has(s), `${id} -> feature ${s}`);
  }
});

test("internal links in content resolve to existing routes", () => {
  for (const { id, texts } of allContent) {
    for (const t of texts) {
      for (const m of t.matchAll(/\]\((\/[^)]*)\)/g)) {
        assert.ok(routeExists(m[1]), `${id} links to missing route ${m[1]}`);
      }
    }
  }
});

test("content has no em-dashes and no unfinished placeholders", () => {
  for (const { id, texts } of allContent) {
    for (const t of texts) {
      assert.ok(!t.includes(String.fromCharCode(0x2014)), `${id} contains an em-dash`);
      assert.ok(!/TODO|lorem ipsum/i.test(t), `${id} has placeholder text`);
    }
  }
});

test("sitemap lists only canonical public routes, once each", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, "duplicate sitemap URL");
  for (const e of entries) {
    assert.ok(e.url.startsWith(SITE_URL), e.url);
    assert.ok(!e.url.includes("?"), e.url);
    // Private top-level routes only. Documentation pages such as
    // /docs/cli/installation are public.
    const firstSegment = new URL(e.url).pathname.split("/")[1];
    assert.ok(
      !["dashboard", "api", "invite", "cli", "sign-in", "sign-up"].includes(firstSegment),
      e.url,
    );
    assert.ok(routeExists(new URL(e.url).pathname), `sitemap has missing route ${e.url}`);
    assert.match(String(e.lastModified), /^\d{4}-\d{2}-\d{2}$/);
  }
  // every article and feature is discoverable through the sitemap
  for (const a of articles) assert.ok(urls.includes(`${SITE_URL}/blog/${a.slug}`));
  for (const f of features) assert.ok(urls.includes(`${SITE_URL}/features/${f.slug}`));
});

test("robots.txt keeps the API out and points to the sitemap", () => {
  const r = robots();
  assert.equal(r.sitemap, `${SITE_URL}/sitemap.xml`);
  assert.deepEqual(r.rules.disallow, "/api/");
});

test("pageMetadata sets a canonical path and carries the social image", () => {
  const m = pageMetadata({ title: "T", description: "D", path: "/blog/x" });
  assert.equal(m.alternates.canonical, "/blog/x");
  assert.equal(m.openGraph.images[0].url, "/og-image.png");
  assert.equal(m.twitter.card, "summary_large_image");
});
