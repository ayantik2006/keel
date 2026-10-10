import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { saveConfig, validateConfig } from "../config.js";
import { CliError } from "../errors.js";
import { openCredentialStore } from "../credentials.js";
import { PROJECT_CONFIG_NAME } from "../paths.js";
import { selectOne } from "../prompt.js";
import { info, requireSession, warn } from "../session.js";
import { performLogin } from "./login.js";

type ProjectSummary = {
  id: string;
  name: string;
  role: string;
  environments: string[];
};

export const INIT_HELP = `Usage: keel init [options]

Choose a project and environment for the current directory and save them to
${PROJECT_CONFIG_NAME}. Only the API URL, project id and environment are saved.
Never tokens or secret values.

Options:
  --project <id>    Project id (skips the project prompt)
  --env <slug>      Environment slug, e.g. development (skips the prompt)
  --api-url <url>   Server to use if you are not logged in yet
  -h, --help        Show this help

Only projects and environments you are authorized for are offered. To switch
later, run \`keel init\` again.
`;

export async function initCommand(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: "string" },
      env: { type: "string" },
      "api-url": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });
  if (values.help) return void process.stdout.write(INIT_HELP);

  const store = await openCredentialStore(warn);
  if (!(await store.read())) {
    info("You are not logged in. Starting login first.");
    await performLogin({ apiUrl: values["api-url"] });
  }

  const { client, credentials } = await requireSession(values["api-url"]);
  const { projects } = await client.request<{ projects: ProjectSummary[] }>(
    "GET",
    "/api/projects",
  );
  const usable = projects.filter((p) => p.environments.length > 0);
  if (usable.length === 0)
    throw new CliError(
      projects.length === 0
        ? "You do not have access to any projects."
        : "You have no access to any environment in your projects. Ask a project admin for access.",
    );

  let project: ProjectSummary;
  if (values.project) {
    const found = usable.find((p) => p.id === values.project);
    if (!found)
      throw new CliError("That project was not found or you do not have access to it.");
    project = found;
  } else {
    project = await selectOne(
      "Select a project:",
      usable.map((p) => ({ label: `${p.name} (${p.role})`, value: p })),
    );
  }

  let environment: string;
  if (values.env) {
    if (!project.environments.includes(values.env))
      throw new CliError(
        `Environment "${values.env}" is not available to you in ${project.name}. Available: ${project.environments.join(", ")}.`,
      );
    environment = values.env;
  } else {
    environment = await selectOne(
      "Select an environment:",
      project.environments.map((e) => ({ label: e, value: e })),
    );
  }

  const config = validateConfig({
    apiUrl: credentials.apiUrl,
    projectId: project.id,
    environment,
    projectName: project.name,
  });
  const file = await saveConfig(config);

  info(`\nSaved ${path.basename(file)}: ${project.name} / ${environment}`);
  info(`To change the project or environment, run \`keel init\` again.`);
  await gitignoreHint(path.dirname(file));
}

async function gitignoreHint(dir: string) {
  let ignored = false;
  try {
    const text = await readFile(path.join(dir, ".gitignore"), "utf8");
    ignored = text.split(/\r?\n/).some((l) => l.trim() === PROJECT_CONFIG_NAME);
  } catch {
    /* no .gitignore */
  }
  if (!ignored)
    warn(
      `${PROJECT_CONFIG_NAME} holds no secrets, but it is local to you. Add it to .gitignore:\n  ${PROJECT_CONFIG_NAME}`,
    );
}
