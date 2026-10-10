// Minimal resolver so Node can run the app's TypeScript modules in scripts
// and tests: "@/..." alias, extensionless relative imports, and stubs for
// "server-only" and Clerk. Only used by `npm test` and the migration script.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const file = (p) => ({ url: pathToFileURL(p).href, shortCircuit: true });

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return file(path.join(here, "empty.mjs"));
  if (specifier === "next/headers")
    return file(path.join(here, "next-headers-mock.mjs"));
  if (specifier === "@clerk/nextjs/server")
    return file(path.join(here, "clerk-mock.mjs"));

  if (specifier.startsWith("@/")) {
    const p = path.join(ROOT, specifier.slice(2));
    return file(existsSync(p + ".ts") ? p + ".ts" : p);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const p = path.join(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (existsSync(p + ".ts")) return file(p + ".ts");
  }
  return next(specifier, context);
}
