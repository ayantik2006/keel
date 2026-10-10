import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const { NAV, ALL_SLUGS, neighbours, sectionOf } = await import("../lib/docs/nav.ts");
const { loadDoc, loadAllDocs, buildSearchIndex } = await import("../lib/docs/load.ts");
const { parseMarkdown, parseFrontmatter, slugifyHeading } = await import("../lib/docs/markdown.ts");
const { highlight } = await import("../lib/docs/highlight.ts");
const { searchDocs, tokenize } = await import("../lib/docs/search.ts");

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content", "docs");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const docs = loadAllDocs();
const bySlug = new Map(docs.map((d) => [d.slug, d]));
const sourceOf = (slug) => readFileSync(path.join(CONTENT, `${slug}.md`), "utf8");

test("every navigation entry has a file and every file is in the navigation", () => {
  const files = walk(CONTENT)
    .map((f) => path.relative(CONTENT, f).replace(/\\/g, "/").replace(/\.md$/, ""))
    .sort();
  assert.deepEqual(files, [...ALL_SLUGS].sort());
  assert.equal(new Set(ALL_SLUGS).size, ALL_SLUGS.length, "duplicate slug in NAV");
});

test("reading order links every page to its neighbours", () => {
  assert.equal(neighbours(ALL_SLUGS[0]).prev, null);
  assert.equal(neighbours(ALL_SLUGS.at(-1)).next, null);
  for (let i = 1; i < ALL_SLUGS.length - 1; i++) {
    const n = neighbours(ALL_SLUGS[i]);
    assert.equal(n.prev, ALL_SLUGS[i - 1]);
    assert.equal(n.next, ALL_SLUGS[i + 1]);
  }
  for (const slug of ALL_SLUGS) assert.ok(sectionOf(slug), slug);
  assert.ok(NAV.every((s) => s.pages.length > 0));
});

test("titles and descriptions are unique and sized for search results", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const d of docs) {
    assert.ok(d.title.length <= 60, `${d.slug} title too long`);
    assert.ok(
      d.description.length >= 60 && d.description.length <= 200,
      `${d.slug} description length ${d.description.length}`,
    );
    assert.match(d.updated, /^\d{4}-\d{2}-\d{2}$/, d.slug);
    assert.ok(!titles.has(d.title), `duplicate title ${d.title}`);
    assert.ok(!descriptions.has(d.description), `duplicate description ${d.slug}`);
    titles.add(d.title);
    descriptions.add(d.description);
  }
});

test("every page opens with an introduction and has enough substance", () => {
  for (const d of docs) {
    assert.ok(d.blocks.length > 0, d.slug);
    assert.notEqual(d.blocks[0].type, "heading", `${d.slug} starts with a heading, not an intro`);
    const words = sourceOf(d.slug).split(/\s+/).length;
    assert.ok(words >= 150, `${d.slug} is thin (${words} words)`);
  }
});

test("no em-dashes, placeholders or unfinished text in the docs", () => {
  for (const slug of ALL_SLUGS) {
    const text = sourceOf(slug);
    assert.ok(!text.includes(String.fromCharCode(0x2014)), `${slug} contains an em-dash`);
    assert.ok(!/\bTODO\b|lorem ipsum|\bFIXME\b/i.test(text), `${slug} has placeholder text`);
  }
});

test("every code block declares a language", () => {
  for (const d of docs) {
    // A bare opening fence would silently parse as plain text.
    const bare = sourceOf(d.slug)
      .split("\n")
      .reduce(
        (acc, line) => {
          if (/^```/.test(line)) {
            if (!acc.open && line.trim() === "```") acc.bare++;
            acc.open = !acc.open;
          }
          return acc;
        },
        { open: false, bare: 0 },
      ).bare;
    assert.equal(bare, 0, `${d.slug} has a code fence without a language`);
  }
});

const EXTERNAL_OK = new Set(["/contact", "/features", "/blog", "/dashboard", "/privacy", "/terms", "/sign-in", "/sign-up"]);

test("internal links and anchors resolve", () => {
  for (const d of docs) {
    const texts = d.blocks.flatMap((b) => {
      if (b.type === "p") return [b.text];
      if (b.type === "ul" || b.type === "ol") return b.items;
      if (b.type === "table") return [...b.head, ...b.rows.flat()];
      if (b.type === "callout") return b.paras;
      return [];
    });
    for (const t of texts) {
      for (const m of t.matchAll(/\]\((\/[^)]*)\)/g)) {
        const [target, anchor] = m[1].split("#");
        if (target.startsWith("/docs")) {
          const slug = target === "/docs" ? null : target.slice("/docs/".length);
          if (slug === null) continue;
          assert.ok(bySlug.has(slug), `${d.slug} links to missing page ${m[1]}`);
          if (anchor)
            assert.ok(
              bySlug.get(slug).toc.some((h) => h.id === anchor),
              `${d.slug} links to missing anchor ${m[1]}`,
            );
        } else {
          assert.ok(EXTERNAL_OK.has(target), `${d.slug} links to unknown route ${m[1]}`);
        }
      }
    }
  }
});

test("heading ids are unique within a page", () => {
  for (const d of docs) {
    const ids = d.toc.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, d.slug);
  }
});

test("markdown parser handles headings, lists, code, tables and callouts", () => {
  const blocks = parseMarkdown(
    [
      "Intro paragraph with `code`.",
      "",
      "## First `thing`",
      "",
      "- one",
      "- two",
      "  continued",
      "",
      "1. a",
      "2. b",
      "",
      "```bash",
      "keel run -- npm run dev",
      "```",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | `x\\|y` |",
      "",
      ":::warning Careful",
      "First para.",
      "",
      "Second para.",
      ":::",
      "",
      "## First `thing`",
    ].join("\n"),
  );
  assert.equal(blocks[0].type, "p");
  assert.deepEqual(blocks[1], { type: "heading", level: 2, text: "First `thing`", id: "first-thing" });
  assert.deepEqual(blocks[2], { type: "ul", items: ["one", "two continued"] });
  assert.deepEqual(blocks[3], { type: "ol", items: ["a", "b"] });
  assert.deepEqual(blocks[4], { type: "code", lang: "bash", code: "keel run -- npm run dev" });
  assert.equal(blocks[5].type, "table");
  assert.equal(blocks[5].rows[0][1], "`x|y`");
  assert.deepEqual(blocks[6], {
    type: "callout",
    kind: "warning",
    title: "Careful",
    paras: ["First para.", "Second para."],
  });
  assert.equal(blocks[7].id, "first-thing-2");
  assert.throws(() => parseFrontmatter("no frontmatter"));
  assert.equal(slugifyHeading("Roles and permissions"), "roles-and-permissions");
});

test("highlighter never drops or changes text", () => {
  const samples = [
    ["bash", 'keel run --env staging -- node server.js # comment\nexport A="b c"'],
    ["json", '{ "a": [1, true, null], "b": "x\\"y" }'],
    ["js", "const a = `t`; // c\nif (a) { return 1 }"],
    ["http", "GET /api/projects HTTP/1.1\nContent-Type: application/json"],
    ["env", "KEY=value # note\nOTHER='x'"],
    ["unknown", "anything <b> & more"],
  ];
  for (const [lang, code] of samples) {
    assert.equal(highlight(code, lang).map((t) => t.text).join(""), code, lang);
  }
});

const index = buildSearchIndex((slug) => sectionOf(slug)?.title ?? "");

test("search index covers every page and heading", () => {
  for (const d of docs) {
    const entries = index.filter((e) => e.path === `/docs/${d.slug}`);
    assert.ok(entries.length >= 1 + d.toc.length - 0, `${d.slug} missing sections`);
    for (const h of d.toc) assert.ok(entries.some((e) => e.anchor === h.id), `${d.slug}#${h.id}`);
  }
  assert.ok(index.every((e) => !e.path.includes("undefined")));
});

test("search ranks the right page and returns snippets", () => {
  const top = (q) => searchDocs(index, q)[0];
  assert.equal(top("keel run").entry.path, "/docs/cli/run");
  assert.equal(top("rollback").entry.path, "/docs/version-history");
  assert.match(top("SECRETS_ENCRYPTION_KEY").entry.path, /environment-variables|security/);
  assert.equal(top("device code").entry.path.startsWith("/docs/"), true);
  const r = searchDocs(index, "deploy hook")[0];
  assert.ok(r.snippet.some((s) => s.mark), "snippet highlights the match");
  assert.deepEqual(searchDocs(index, ""), []);
  assert.deepEqual(searchDocs(index, "zzzqqqxxx"), []);
  assert.deepEqual(tokenize("  Keel,  RUN! "), ["keel", "run"]);
});

// --- Accuracy checks against the real implementation -----------------------

const apiFiles = walk(path.join(ROOT, "app", "api")).filter((f) => f.endsWith("route.ts"));

test("every API route and method is documented", () => {
  const apiDocs = ALL_SLUGS.filter((s) => s.startsWith("api/"))
    .map(sourceOf)
    .join("\n");
  const missing = [];
  for (const file of apiFiles) {
    const rel = path
      .relative(path.join(ROOT, "app"), path.dirname(file))
      .replace(/\\/g, "/");
    const route = "/" + rel.replace(/\[([^\]]+)\]/g, ":$1");
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) =/g)) {
      const heading = `### ${m[1]} ${route}`;
      if (!apiDocs.includes(heading)) missing.push(`${m[1]} ${route}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("documented API routes exist in the code", () => {
  const known = new Set();
  for (const file of apiFiles) {
    const rel = path.relative(path.join(ROOT, "app"), path.dirname(file)).replace(/\\/g, "/");
    const route = "/" + rel.replace(/\[([^\]]+)\]/g, ":$1");
    for (const m of readFileSync(file, "utf8").matchAll(/export const (GET|POST|PUT|PATCH|DELETE) =/g))
      known.add(`${m[1]} ${route}`);
  }
  const apiDocs = ALL_SLUGS.filter((s) => s.startsWith("api/")).map(sourceOf).join("\n");
  for (const m of apiDocs.matchAll(/^### (GET|POST|PUT|PATCH|DELETE) (\/api\S*)$/gm)) {
    assert.ok(known.has(`${m[1]} ${m[2]}`), `documented but not implemented: ${m[1]} ${m[2]}`);
  }
});

test("CLI commands and flags in the docs exist in the CLI source", () => {
  const cliSource = walk(path.join(ROOT, "cli", "src"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const subcommands = new Set(["login", "logout", "init", "secrets", "run"]);
  const secretsSub = new Set(["list", "ls", "set"]);

  for (const d of docs) {
    for (const b of d.blocks) {
      if (b.type !== "code" || !["bash", "sh", "shell"].includes(b.lang)) continue;
      for (const line of b.code.split("\n")) {
        const cmd = /(?:^|\|\s*|^\$\s*)keel\s+([a-z-]+)(?:\s+([a-z-]+))?(.*)$/.exec(line.trim());
        if (!cmd) continue;
        const [, name, sub, rest] = cmd;
        if (name.startsWith("-")) continue; // keel --version
        assert.ok(subcommands.has(name), `${d.slug}: unknown command keel ${name}`);
        if (name === "secrets" && sub && !sub.startsWith("-") && sub.toUpperCase() !== sub)
          assert.ok(secretsSub.has(sub), `${d.slug}: unknown secrets command ${sub}`);
        for (const flag of (line.split(" -- ")[0] ?? line).matchAll(/\s(--[a-z-]+)/g)) {
          assert.ok(
            cliSource.includes(`"${flag[1].slice(2)}"`) || cliSource.includes(flag[1]),
            `${d.slug}: unknown flag ${flag[1]} in "${line.trim()}"`,
          );
        }
        void rest;
      }
    }
  }
});

test("the environment variable reference matches what the code reads", () => {
  const ref = sourceOf("reference/environment-variables");
  const sources = [
    ...walk(path.join(ROOT, "app")),
    ...walk(path.join(ROOT, "lib")),
    ...walk(path.join(ROOT, "cli", "src")),
    path.join(ROOT, "instrumentation.ts"),
  ].filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}content${path.sep}`));
  const used = new Set();
  for (const f of sources) {
    for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g))
      used.add(m[1]);
  }
  // Provided by the platform or the OS rather than configured for Keel.
  const platform = new Set(["NODE_ENV", "NEXT_RUNTIME", "PATH", "PATHEXT", "P", "APPDATA", "XDG_CONFIG_HOME"]);
  const missing = [...used].filter((n) => !platform.has(n) && !ref.includes(n));
  assert.deepEqual(missing, [], "variables read by the code but not documented");
  for (const n of ["NODE_ENV", "APPDATA", "XDG_CONFIG_HOME"]) assert.ok(ref.includes(n), n);
});

test("documented limits match the code", () => {
  const api = readFileSync(path.join(ROOT, "lib", "api.ts"), "utf8");
  assert.match(api, /length > 128/);
  assert.match(api, /length > 10_000/);
  assert.match(api, /length > 60/);
  assert.match(api, /length > 280/);
  const all = docs.map((d) => sourceOf(d.slug)).join("\n");
  assert.ok(all.includes("128 characters") && all.includes("10,000 characters"));

  const auth = readFileSync(path.join(ROOT, "lib", "cli-auth.ts"), "utf8");
  assert.match(auth, /ACCESS_TTL_MS = 60 \* 60 \* 1000/);
  assert.match(auth, /REFRESH_TTL_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(auth, /DEVICE_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(auth, /POLL_INTERVAL_SECONDS = 3/);

  const inv = readFileSync(
    path.join(ROOT, "app", "api", "projects", "[projectId]", "invitations", "route.ts"),
    "utf8",
  );
  assert.match(inv, /INVITE_TTL_MS = 7 \* 24/);
});

test("roles and permissions table matches the permission matrix", async () => {
  const src = readFileSync(path.join(ROOT, "lib", "permissions.ts"), "utf8");
  // Only the owner holds project:delete, and only admins and above hold audit:read.
  assert.match(src, /owner: \[\.\.\.ADMIN, "project:delete"\]/);
  assert.ok(/const VIEWER[^;]*"secrets:read"/s.test(src));
  assert.ok(/const ADMIN[\s\S]*"audit:read"/.test(src));
  const access = sourceOf("access-control");
  assert.ok(access.includes("| Delete the project | no | no | no | yes |"));
  assert.ok(access.includes("| Read the audit log and security overview | no | no | yes | yes |"));
});
