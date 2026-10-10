import type { Article } from "./types";

const OWASP =
  "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html";
const TWELVE_FACTOR = "https://12factor.net/config";

export const articles: Article[] = [
  {
    slug: "what-is-secrets-management",
    title: "What is secrets management? A practical guide for developers",
    metaTitle: "What Is Secrets Management? A Practical Guide",
    description:
      "Secrets management is how you store, distribute, and control access to credentials such as API keys and database passwords. Here is what it covers and where to start.",
    published: "2026-10-11",
    topic: "Fundamentals",
    body: [
      {
        type: "p",
        text: "Secrets management is the practice of storing sensitive credentials in a controlled system, delivering them to the software and people that need them, and keeping a record of who accessed what. A secret is any value that grants access: an API key, a database password, a signing key, an OAuth client secret, a webhook token.",
      },
      { type: "h2", text: "What counts as a secret" },
      {
        type: "p",
        text: "The test is simple: if someone who obtained the value could do something they should not be able to do, it is a secret. A database URL with an embedded password is a secret. The port number of your dev server is not. Many configuration values sit in between, which is why [environment variables and secrets are not the same thing](/blog/environment-variables-vs-secrets).",
      },
      { type: "h2", text: "The problems it solves" },
      {
        type: "ul",
        items: [
          "**Sprawl:** the same key lives in a `.env` file, a CI setting, a chat message, and a wiki page, and nobody knows which is current.",
          "**Leakage:** values end up in Git history, container images, logs, and screenshots.",
          "**Over-access:** everyone on the team can read production credentials because there is no other way to share them.",
          "**No trail:** when a key is abused, there is no record of who had it.",
          "**Painful change:** replacing a credential means hunting down every copy.",
        ],
      },
      { type: "h2", text: "What a secrets manager does" },
      {
        type: "ol",
        items: [
          "**Encrypts** values at rest, so a database dump alone is not enough to read them.",
          "**Controls access** by role and environment, so a contractor can read development values without seeing production.",
          "**Delivers** values to applications at runtime or deploy time, rather than baking them into code or images.",
          "**Records** reads, changes, and denied attempts in an audit log.",
          "**Keeps history**, so a bad change can be undone.",
        ],
      },
      { type: "h2", text: "A realistic starting point" },
      {
        type: "p",
        text: "You do not need a large platform on day one. Begin with three habits: keep secrets out of source control, give each environment its own values, and store the real values somewhere with access control and an audit trail instead of a shared file. The [OWASP Secrets Management Cheat Sheet](" +
          OWASP +
          ") is a good reference for going further.",
      },
      { type: "h2", text: "What secrets management does not do" },
      {
        type: "p",
        text: "It does not make a leaked secret safe, and it does not fix an application that logs its own credentials. It reduces how many places a secret lives and how many people can reach it. You still need to rotate credentials that were exposed, and to scope each key to the least privilege it needs.",
      },
      {
        type: "p",
        text: "If you want to see how this looks in a product, read about [how Keel handles secrets management](/features/secrets-management).",
      },
    ],
    relatedArticles: [
      "environment-variables-vs-secrets",
      "common-secrets-management-mistakes",
      "how-to-store-api-keys-securely",
    ],
    relatedFeatures: ["secrets-management", "access-control"],
  },
  {
    slug: "environment-variables-vs-secrets",
    title: "Environment variables vs. secrets: what is the difference?",
    metaTitle: "Environment Variables vs. Secrets Explained",
    description:
      "Environment variables are a way to deliver configuration. Secrets are a kind of value that needs protection. Here is how the two overlap and why it matters.",
    published: "2026-10-11",
    topic: "Fundamentals",
    body: [
      {
        type: "p",
        text: "The short answer: an environment variable is a delivery mechanism, and a secret is a sensitivity classification. A secret is often delivered as an environment variable, but plenty of environment variables are not secrets, and secrets do not have to be environment variables.",
      },
      { type: "h2", text: "Environment variables" },
      {
        type: "p",
        text: "An environment variable is a named string provided to a process by its surroundings. The [twelve-factor app methodology](" +
          TWELVE_FACTOR +
          ") recommends storing configuration this way because it keeps config out of code and lets the same build run in different environments.",
      },
      {
        type: "code",
        lang: "bash",
        code: "NODE_ENV=production\nPORT=8080\nLOG_LEVEL=info\nSTRIPE_SECRET_KEY=sk_live_...",
      },
      {
        type: "p",
        text: "The first three are plain configuration. Anyone can see them without harm. The last one is a secret that happens to travel the same way.",
      },
      { type: "h2", text: "Secrets" },
      {
        type: "p",
        text: "A secret is any value whose disclosure grants access or causes harm. What matters is how it must be handled: encrypted at rest, restricted to those who need it, kept out of logs and version control, and replaceable when exposed.",
      },
      { type: "h2", text: "Why the distinction matters" },
      {
        type: "ul",
        items: [
          "**Different handling.** `LOG_LEVEL` can live in a config file in the repository. `DATABASE_URL` with a password cannot.",
          "**Different visibility.** Environment variables are visible to the process and its children, and to anyone who can inspect the process or container. Treat them as readable by everything running as that user.",
          "**Different frontend rules.** Variables with a public prefix such as `NEXT_PUBLIC_` or `VITE_` are inlined into browser bundles. A secret placed there is public.",
        ],
      },
      { type: "h2", text: "Where environment-variable delivery leaks" },
      {
        type: "p",
        text: "Environment variables are convenient, but they are not a vault. Common leak paths include crash reports that dump the environment, debug endpoints that print `process.env`, `docker inspect` output, build arguments recorded in image history, and child processes that inherit variables they do not need.",
      },
      { type: "h2", text: "A practical rule" },
      {
        type: "p",
        text: "Classify each variable. Non-sensitive configuration can be committed or kept in plain config. Sensitive values belong in a store with access control, injected at deploy or run time. Keel keeps both side by side per environment, so you can [manage environment variables across environments](/features/environment-variables) while treating secret values with the care they need.",
      },
    ],
    relatedArticles: [
      "what-is-secrets-management",
      "manage-environment-variables-across-environments",
      "keep-secrets-out-of-git-repositories",
    ],
    relatedFeatures: ["environment-variables", "secrets-management"],
  },
  {
    slug: "how-to-store-api-keys-securely",
    title: "How to store API keys securely in a web application",
    metaTitle: "How to Store API Keys Securely in a Web App",
    description:
      "Where API keys should and should not live in a web application: server-side storage, browser limits, build-time pitfalls, and what to do when a key is exposed.",
    published: "2026-10-11",
    topic: "Practical guides",
    body: [
      {
        type: "p",
        text: "The rule that covers most cases: an API key that must stay secret belongs on a server you control, loaded from outside your source code, and never sent to the browser.",
      },
      { type: "h2", text: "Decide whether the key can be public" },
      {
        type: "p",
        text: "Some keys are designed to be public, such as a Stripe publishable key or a map tile token restricted to your domain. Others grant full account access. Read the provider's documentation. If a key is public by design, restrict it by domain or scope. If it is not, it never goes in client code.",
      },
      { type: "h2", text: "Keep secret keys on the server" },
      {
        type: "p",
        text: "Call third-party APIs from your backend, and have the browser call your backend. In a framework with server routes, that looks like this:",
      },
      {
        type: "code",
        lang: "ts",
        code: '// app/api/send/route.ts (runs on the server only)\nexport async function POST(req: Request) {\n  const apiKey = process.env.EMAIL_API_KEY;\n  if (!apiKey) return new Response("Not configured", { status: 500 });\n  // ...call the provider with apiKey, never return it\n  return Response.json({ ok: true });\n}',
      },
      { type: "h2", text: "Load keys from the environment, not the code" },
      {
        type: "ul",
        items: [
          "Never hard-code a key in source files, even in a private repository.",
          "Do not commit `.env` files. Commit a `.env.example` with empty values instead.",
          "Use a different key per environment so a leaked development key cannot touch production.",
          "Avoid baking keys into container images through `ENV` or build arguments. They remain readable in the image layers.",
        ],
      },
      { type: "h2", text: "Watch the public-prefix trap" },
      {
        type: "p",
        text: "Frameworks inline variables with certain prefixes, such as `NEXT_PUBLIC_` or `VITE_`, into the JavaScript sent to users. If you put a secret behind one of those prefixes to make an error go away, you have published it. Check the built output when in doubt.",
      },
      { type: "h2", text: "Store the real values somewhere with access control" },
      {
        type: "p",
        text: "At some point the value has to live somewhere other than your own head. A shared file or chat thread has no access control or history. A dedicated store gives you encryption at rest, role-based access, and an audit trail. That is what [Keel's secrets management](/features/secrets-management) provides.",
      },
      { type: "h2", text: "Limit what each key can do" },
      {
        type: "p",
        text: "Create keys with the narrowest scope the provider allows: read-only where possible, restricted to the resources and IP ranges that need it. A leaked narrow key is an incident. A leaked broad key is a breach.",
      },
      { type: "h2", text: "If a key is exposed" },
      {
        type: "ol",
        items: [
          "Revoke or rotate it at the provider first.",
          "Update the new value wherever it is used.",
          "Review the provider's usage logs for activity you do not recognise.",
          "Then clean the source of the leak. See [how to keep secrets out of Git repositories](/blog/keep-secrets-out-of-git-repositories).",
        ],
      },
    ],
    relatedArticles: [
      "keep-secrets-out-of-git-repositories",
      "environment-variables-vs-secrets",
      "common-secrets-management-mistakes",
    ],
    relatedFeatures: ["secrets-management", "secret-versioning"],
  },
  {
    slug: "manage-environment-variables-across-environments",
    title:
      "How to manage environment variables across development, staging, and production",
    metaTitle: "Manage Environment Variables Across Environments",
    description:
      "A workable approach to keeping environment variables consistent and separate across development, staging, and production without copying files around.",
    published: "2026-10-11",
    topic: "Practical guides",
    body: [
      {
        type: "p",
        text: "Most configuration bugs come from the same few causes: a variable that exists in one environment and not another, a production value used in development, or a change made in one place and forgotten in the rest. A little structure removes most of them.",
      },
      { type: "h2", text: "1. Keep one list of variable names" },
      {
        type: "p",
        text: "Maintain a single canonical list of the variables your application needs. A committed `.env.example` file works well:",
      },
      {
        type: "code",
        lang: "bash",
        code: "# .env.example: names only, no real values\nDATABASE_URL=\nSESSION_SECRET=\nSTRIPE_SECRET_KEY=\nLOG_LEVEL=info",
      },
      {
        type: "p",
        text: "This documents what an environment must provide and lets a new developer see what to fill in.",
      },
      { type: "h2", text: "2. Give every environment its own values" },
      {
        type: "p",
        text: "Development, staging, and production should never share credentials. Use separate database users, separate third-party API keys (test mode where the provider offers it), and separate signing secrets. Isolation means a mistake in development cannot damage production.",
      },
      { type: "h2", text: "3. Make staging resemble production" },
      {
        type: "p",
        text: "Staging only catches problems if it is configured like production. Keep the same variable names, the same feature flags, and the same shape of values. Differences should be intentional and few.",
      },
      { type: "h2", text: "4. Store values centrally, not in files" },
      {
        type: "p",
        text: "Passing `.env` files by chat or email creates copies you cannot update or audit. Keep the real values in one store, import existing files once, and let people read only the environments they need. Keel's [environment variable management](/features/environment-variables) is built around this: one project, three environments, per-environment access, and `.env` import and export.",
      },
      { type: "h2", text: "5. Restrict who can read production" },
      {
        type: "p",
        text: "Most developers do not need production credentials to do their work. Grant production access to the few people and systems that deploy or operate the service, and keep a record of reads. See [role-based access control](/features/access-control).",
      },
      { type: "h2", text: "6. Handle changes deliberately" },
      {
        type: "ul",
        items: [
          "Change a value in one place, then deploy or restart the services that read it. Environment variables are read at process start, so running processes do not notice a change.",
          "Keep history so a bad value can be reverted quickly. See [secret version history](/features/secret-versioning).",
          "Add new variables to staging first, confirm the application behaves, then add them to production before the code that needs them ships.",
        ],
      },
      { type: "h2", text: "7. Validate at startup" },
      {
        type: "p",
        text: "Fail fast when configuration is missing, instead of discovering it on the first request:",
      },
      {
        type: "code",
        lang: "ts",
        code: 'const required = ["DATABASE_URL", "SESSION_SECRET"];\nconst missing = required.filter((k) => !process.env[k]);\nif (missing.length) {\n  throw new Error(`Missing environment variables: ${missing.join(", ")}`);\n}',
      },
      {
        type: "p",
        text: "For the background on why configuration belongs in the environment, see the [twelve-factor config principle](" +
          TWELVE_FACTOR +
          ").",
      },
    ],
    relatedArticles: [
      "environment-variables-vs-secrets",
      "keep-secrets-out-of-git-repositories",
      "common-secrets-management-mistakes",
    ],
    relatedFeatures: ["environment-variables", "access-control"],
  },
  {
    slug: "common-secrets-management-mistakes",
    title: "Common secrets management mistakes in software development",
    metaTitle: "Common Secrets Management Mistakes",
    description:
      "The mistakes that most often lead to leaked credentials, from committed .env files to shared production keys, and what to do instead.",
    published: "2026-10-11",
    topic: "Security",
    body: [
      {
        type: "p",
        text: "Few secret leaks involve sophisticated attacks. Most come from ordinary habits that are easy to fall into and easy to fix. These are the ones that show up again and again.",
      },
      { type: "h2", text: "Committing secrets to Git" },
      {
        type: "p",
        text: "A key committed once lives in history, forks, and clones even after you delete the file. Prevent it with a `.gitignore` entry for `.env`, a pre-commit scanner, and platform push protection. Details in [how to keep secrets out of Git repositories](/blog/keep-secrets-out-of-git-repositories).",
      },
      { type: "h2", text: "Using the same credentials everywhere" },
      {
        type: "p",
        text: "One database password across development, staging, and production means a laptop compromise is a production compromise. Use distinct credentials per environment.",
      },
      { type: "h2", text: "Sharing secrets in chat and email" },
      {
        type: "p",
        text: "Messages persist, get searched, and get forwarded. You cannot revoke a copy that you do not know exists. Share access to a store instead of the value itself.",
      },
      { type: "h2", text: "Giving everyone production access" },
      {
        type: "p",
        text: "Convenience tends to win over least privilege. Limit production credentials to the people and systems that operate it, and review the list when people change roles or leave.",
      },
      { type: "h2", text: "Putting secrets behind a public prefix" },
      {
        type: "p",
        text: "Variables prefixed `NEXT_PUBLIC_` or `VITE_` are embedded in client bundles. Anything there is readable by every visitor.",
      },
      { type: "h2", text: "Logging configuration" },
      {
        type: "p",
        text: "Printing the full environment or request headers during debugging puts credentials into log systems with different, usually looser, access. Redact known secret keys and avoid dumping whole objects.",
      },
      { type: "h2", text: "Baking secrets into images" },
      {
        type: "p",
        text: "Values passed with Docker `ENV` or `ARG` can be recovered from image layers and history. Provide secrets at run time instead.",
      },
      { type: "h2", text: "Never rotating, or rotating without a plan" },
      {
        type: "p",
        text: "Credentials that never change keep every past leak alive. But rotating blindly can cause outages. Know where each secret is used, prefer providers that allow two active keys during a transition, and rehearse the change in staging.",
      },
      { type: "h2", text: "Having no record of access" },
      {
        type: "p",
        text: "Without an audit trail you cannot answer who read a key, or whether a former employee used theirs. Prefer tools that log reads, changes, and denied attempts. See [audit logging](/features/audit-logging).",
      },
      { type: "h2", text: "Treating a deleted secret as a safe secret" },
      {
        type: "p",
        text: "Removing a leaked value from a file does not invalidate it. Revoke or rotate it at the provider. Keep that as the first step in every incident. The [OWASP Secrets Management Cheat Sheet](" +
          OWASP +
          ") covers further controls.",
      },
    ],
    relatedArticles: [
      "what-is-secrets-management",
      "how-to-store-api-keys-securely",
      "keep-secrets-out-of-git-repositories",
    ],
    relatedFeatures: ["access-control", "audit-logging"],
  },
  {
    slug: "keep-secrets-out-of-git-repositories",
    title: "How to keep secrets out of Git repositories",
    metaTitle: "How to Keep Secrets Out of Git Repositories",
    description:
      "Prevent API keys and passwords from reaching Git with ignore rules, scanners, and push protection, and learn the correct cleanup order if one gets committed.",
    published: "2026-10-11",
    topic: "Security",
    body: [
      {
        type: "p",
        text: "Git keeps history. A secret committed once is stored in every clone and fork, and removing it from the latest commit does not remove it from earlier ones. Prevention is far cheaper than cleanup.",
      },
      { type: "h2", text: "Prevent" },
      { type: "h3", text: "Ignore local environment files" },
      {
        type: "code",
        lang: "gitignore",
        code: "# .gitignore\n.env\n.env.*\n!.env.example",
      },
      {
        type: "p",
        text: "Note that `.gitignore` only affects untracked files. If `.env` was already committed, stop tracking it with `git rm --cached .env`, then treat its contents as exposed.",
      },
      { type: "h3", text: "Commit an example file, not real values" },
      {
        type: "p",
        text: "A `.env.example` with variable names and empty values documents requirements without risk. Keep the real values in a [secrets store](/features/secrets-management).",
      },
      { type: "h3", text: "Scan before commit" },
      {
        type: "p",
        text: "Tools such as [gitleaks](https://github.com/gitleaks/gitleaks) can run as a pre-commit hook and in CI, and flag strings that look like credentials before they leave your machine.",
      },
      { type: "h3", text: "Turn on push protection" },
      {
        type: "p",
        text: "GitHub's [secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning) can detect known token formats and, with push protection enabled, block a push that contains one.",
      },
      { type: "h2", text: "Respond: the order matters" },
      {
        type: "ol",
        items: [
          "**Revoke or rotate the credential first.** Assume anything pushed was seen. Rewriting history afterwards cannot recall copies.",
          "**Check the provider's logs** for use you do not recognise.",
          "**Remove it from history** with a tool such as [git filter-repo](https://github.com/newren/git-filter-repo), then force-push and ask collaborators to re-clone.",
          "**Follow your host's guidance.** GitHub documents the process in [removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository), including cached views and forks.",
          "**Store the replacement properly**, outside the repository.",
        ],
      },
      { type: "h2", text: "Where the secrets go instead" },
      {
        type: "p",
        text: "Your application still needs the values. Keep them in a store with access control and import or inject them per environment. Keel can [import an existing .env file](/features/environment-variables) once, so the file can be deleted from developers' machines afterwards, and keeps [version history](/features/secret-versioning) of every change.",
      },
      { type: "h2", text: "Private repositories are not a safe place either" },
      {
        type: "p",
        text: "A private repository limits who can read today. It does not account for future access changes, forks, leaked tokens, or mirrored clones. Keep the same rules.",
      },
    ],
    relatedArticles: [
      "how-to-store-api-keys-securely",
      "common-secrets-management-mistakes",
      "environment-variables-vs-secrets",
    ],
    relatedFeatures: ["secrets-management", "environment-variables"],
  },
];

export const articleBySlug = (slug: string) =>
  articles.find((a) => a.slug === slug);

export const sortedArticles = () =>
  [...articles].sort((a, b) => b.published.localeCompare(a.published));

/** Rough reading time at 220 words per minute, from the rendered text. */
export function readingMinutes(a: Article): number {
  const words = a.body
    .map((b) =>
      "text" in b
        ? b.text
        : "items" in b
          ? b.items.join(" ")
          : "",
    )
    .join(" ")
    .split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
