// Serves the real route handlers from app/api over HTTP so the real CLI can be
// tested end to end. Clerk is stubbed: a request acts as a browser user only
// when it carries the x-test-user header (the CLI never sends it), and CLI
// bearer tokens go through the real verification code.
import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const apiDir = path.join(root, "app", "api");

globalThis.__testALS ??= new AsyncLocalStorage();

function discover(dir, segments = []) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...discover(full, [...segments, name]));
    else if (name === "route.ts") out.push({ segments, file: full });
  }
  return out;
}

export async function startBackend() {
  const routes = discover(apiDir).map(({ segments, file }) => {
    const names = [];
    const pattern = segments
      .map((s) => {
        const m = /^\[(.+)\]$/.exec(s);
        if (m) {
          names.push(m[1]);
          return "([^/]+)";
        }
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    return {
      regex: new RegExp(`^/api/${pattern}/?$`),
      names,
      file,
      module: null,
    };
  });
  // Static segments win over dynamic ones, as in Next.
  routes.sort(
    (a, b) =>
      (a.regex.source.match(/\(\[\^\/\]\+\)/g)?.length ?? 0) -
      (b.regex.source.match(/\(\[\^\/\]\+\)/g)?.length ?? 0),
  );

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const route = routes.find((r) => r.regex.test(url.pathname));
      if (!route) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "Not found" }));
      }
      route.module ??= await import(pathToFileURL(route.file).href);
      const handler = route.module[req.method];
      if (!handler) {
        res.writeHead(405);
        return res.end();
      }

      const match = route.regex.exec(url.pathname);
      const params = Object.fromEntries(
        route.names.map((n, i) => [n, decodeURIComponent(match[i + 1])]),
      );

      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);

      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (typeof v === "string") headers.set(k, v);
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) || body.length === 0 ? undefined : body,
      });

      const store = { headers, user: headers.get("x-test-user") };
      const response = await globalThis.__testALS.run(store, () =>
        handler(request, { params: Promise.resolve(params) }),
      );
      const text = await response.text();
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(text);
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "backend adapter failure" }));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const resetRateLimits = () => globalThis.rateBuckets?.clear();

/** Convenience fetch helper that acts as a browser user (cookie auth stand-in). */
export const asUser = (user) => ({ "x-test-user": user });
