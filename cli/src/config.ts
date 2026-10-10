import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CliError } from "./errors.js";
import { PROJECT_CONFIG_NAME } from "./paths.js";
import { normalizeApiUrl } from "./http.js";

/**
 * Project-local configuration. Identifiers only: no tokens, no secret values.
 * `environment` is the environment slug, which is the identifier the API uses.
 */
export type ProjectConfig = {
  apiUrl: string;
  projectId: string;
  environment: string;
  /** Display only. */
  projectName?: string;
};

const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const ENVIRONMENT = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Finds .keel.json in dir or the nearest parent directory. */
export async function findConfigPath(dir: string): Promise<string | null> {
  let current = path.resolve(dir);
  for (;;) {
    const candidate = path.join(current, PROJECT_CONFIG_NAME);
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      /* keep looking */
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Validates untrusted JSON. Anything unexpected is an error, not a guess. */
export function validateConfig(value: unknown): ProjectConfig {
  const bad = (why: string) =>
    new CliError(
      `Invalid ${PROJECT_CONFIG_NAME}: ${why}. Run \`keel init\` to recreate it.`,
    );
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw bad("expected a JSON object");
  const v = value as Record<string, unknown>;

  if (typeof v.apiUrl !== "string") throw bad("apiUrl is missing");
  if (typeof v.projectId !== "string" || !PROJECT_ID.test(v.projectId))
    throw bad("projectId is missing or malformed");
  if (typeof v.environment !== "string" || !ENVIRONMENT.test(v.environment))
    throw bad("environment is missing or malformed");
  if (v.projectName !== undefined && typeof v.projectName !== "string")
    throw bad("projectName must be text");

  return {
    apiUrl: normalizeApiUrl(v.apiUrl),
    projectId: v.projectId,
    environment: v.environment,
    ...(typeof v.projectName === "string" ? { projectName: v.projectName.slice(0, 80) } : {}),
  };
}

export async function loadConfig(cwd = process.cwd()): Promise<{
  config: ProjectConfig;
  file: string;
}> {
  const file = await findConfigPath(cwd);
  if (!file)
    throw new CliError(
      `No ${PROJECT_CONFIG_NAME} found. Run \`keel init\` in your project directory.`,
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new CliError(
      `${PROJECT_CONFIG_NAME} is not valid JSON. Run \`keel init\` to recreate it.`,
    );
  }
  return { config: validateConfig(parsed), file };
}

export async function saveConfig(config: ProjectConfig, cwd = process.cwd()) {
  const file = path.join(cwd, PROJECT_CONFIG_NAME);
  const clean: ProjectConfig = {
    apiUrl: config.apiUrl,
    projectId: config.projectId,
    environment: config.environment,
    ...(config.projectName ? { projectName: config.projectName } : {}),
  };
  await writeFile(file, JSON.stringify(clean, null, 2) + "\n", "utf8");
  return file;
}
