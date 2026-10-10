import type { Feature } from "./types";

/**
 * Public feature pages. Every statement here must match what the product
 * does today (see docs/ and lib/). Planned work does not belong on this list.
 */
export const features: Feature[] = [
  {
    slug: "secrets-management",
    title: "Secrets management for application teams",
    metaTitle: "Secrets Management for Developers",
    description:
      "Store API keys, tokens, and credentials in one encrypted workspace instead of scattering them across .env files, chat threads, and CI settings.",
    label: "Secrets management",
    summary:
      "One encrypted place for API keys, tokens, and credentials, organised by project and environment.",
    updated: "2026-10-11",
    intro:
      "Keel keeps application secrets in one encrypted workspace, grouped by project and environment, so the people and services that need a value can get it and nobody else can.",
    body: [
      { type: "h2", text: "The problem Keel solves" },
      {
        type: "p",
        text: "Most teams start with a `.env` file and a shared message thread. That works until someone leaves, a laptop is lost, or a value changes and half the team keeps running the old one. Secrets end up in repositories, screenshots, CI settings, and personal notes, with no record of who has what.",
      },
      {
        type: "p",
        text: "Keel replaces that sprawl with a single system of record. Each project holds its secrets per environment, every change is versioned, and access is decided by role rather than by who happened to receive a copy.",
      },
      { type: "h2", text: "How secrets are stored" },
      {
        type: "ul",
        items: [
          "Secret values are encrypted at rest with AES-256-GCM. Each value gets its own random nonce and an authentication tag, so tampering is detected on read.",
          "The encryption key is supplied by the server environment and is never written to the database.",
          "Values are decrypted only after the request passes project role and environment access checks.",
          "Revealing a value and exporting an environment are recorded in the [audit log](/features/audit-logging).",
        ],
      },
      { type: "h2", text: "How teams use it" },
      {
        type: "ol",
        items: [
          "Create a project and choose who can access it.",
          "Add secrets to the Development, Staging, and Production environments, or [import an existing .env file](/features/environment-variables).",
          "Invite teammates with the role that fits: owner, admin, member, or viewer.",
          "Change values when you need to. Earlier values stay available through [version history](/features/secret-versioning).",
        ],
      },
      { type: "h2", text: "What Keel does not do yet" },
      {
        type: "p",
        text: "Being clear about limits matters for a security product. Keel does not currently rotate secrets automatically, does not issue machine or API credentials separate from user accounts, and does not use an external KMS or HSM. The encryption key is held by the server environment.",
      },
    ],
    faq: [
      {
        q: "Where are secret values stored?",
        a: "In the Keel database as AES-256-GCM ciphertext. The encryption key is provided by the server environment and is not stored alongside the data.",
      },
      {
        q: "Who can read a secret?",
        a: "Only project members whose role allows reading secrets and who have access to that environment. Members and viewers need an explicit environment grant.",
      },
      {
        q: "Does Keel rotate secrets for me?",
        a: "No. You change a value yourself and Keel keeps the previous versions. Automatic rotation is not available.",
      },
    ],
    relatedArticles: [
      "what-is-secrets-management",
      "how-to-store-api-keys-securely",
    ],
    relatedFeatures: ["environment-variables", "access-control"],
  },
  {
    slug: "environment-variables",
    title: "Environment variable management across environments",
    metaTitle: "Environment Variable Management",
    description:
      "Keep development, staging, and production environment variables separate, import and export .env files, and stop copying values by hand.",
    label: "Environment variables",
    summary:
      "Separate Development, Staging, and Production values, with .env import and export.",
    updated: "2026-10-11",
    intro:
      "Every project in Keel has Development, Staging, and Production environments. The same key can hold a different value in each, and each environment can have its own access list.",
    body: [
      { type: "h2", text: "One key, three values" },
      {
        type: "p",
        text: "An application usually reads the same variable name everywhere, such as `DATABASE_URL`, but the value differs by environment. Keel stores them side by side under one project so the differences are visible and deliberate instead of buried in three different files.",
      },
      { type: "h2", text: "Import an existing .env file" },
      {
        type: "p",
        text: "Drop a `.env`, `.env.<name>`, or `*.env` file into the dashboard. Parsing happens in your browser and nothing is sent until you confirm. The preview never shows values, and marks each key as new, existing, duplicate, or invalid so you can decide what happens before anything is saved.",
      },
      {
        type: "ul",
        items: [
          "Existing keys can be skipped or overwritten. Overwriting creates a new version, so the old value is kept.",
          "Duplicate keys within the file must be resolved before import.",
          "Files up to 256 KB and 500 variables are accepted.",
        ],
      },
      { type: "h2", text: "Export when you need a file" },
      {
        type: "p",
        text: "Export generates a `.env.<environment>` file in memory for the environment you pick, after confirmation. Nothing is stored on the server, the action is recorded in the [audit log](/features/audit-logging), and exported values round-trip to the same values when re-imported.",
      },
      { type: "h2", text: "Push to Vercel" },
      {
        type: "p",
        text: "Project admins can connect a Vercel project and map Keel environments to Vercel targets. Keel then creates and updates encrypted Vercel environment variables, and only touches variables it created. This integration is new, so check the result in Vercel after your first sync.",
      },
      { type: "h2", text: "Read more" },
      {
        type: "p",
        text: "For the reasoning behind separating environments, read [how to manage environment variables across development, staging, and production](/blog/manage-environment-variables-across-environments).",
      },
    ],
    faq: [
      {
        q: "Can I import my current .env file?",
        a: "Yes. Choose the file in the dashboard, review the value-free preview, resolve any duplicates, and confirm. Nothing is saved until you do.",
      },
      {
        q: "Are environments isolated from each other?",
        a: "Values are stored per environment, and access is granted per environment. A member or viewer with no grant for Production cannot see it.",
      },
      {
        q: "Which dotenv syntax is supported?",
        a: "KEY=value with optional export prefix, comments, single and double quotes, and multi-line quoted values. Variable expansion such as ${VAR} is not performed.",
      },
    ],
    relatedArticles: [
      "manage-environment-variables-across-environments",
      "environment-variables-vs-secrets",
    ],
    relatedFeatures: ["secrets-management", "access-control"],
  },
  {
    slug: "secret-versioning",
    title: "Secret version history and rollback",
    metaTitle: "Secret Versioning and Rollback",
    description:
      "Every change to a secret is kept as a numbered version, so you can see what changed, inspect an earlier value, and restore it.",
    label: "Version history",
    summary:
      "Numbered versions for every change, with restore to any earlier value.",
    updated: "2026-10-11",
    intro:
      "Changing a secret should never mean losing the value it replaced. Keel records each change as a numbered version and lets authorised people restore an earlier one.",
    body: [
      { type: "h2", text: "Why version history matters" },
      {
        type: "p",
        text: "A bad value in production is one of the faster ways to cause an outage. When a credential is changed by mistake, or a new key turns out to be wrong, the quickest fix is to put the previous value back. Without history that value is gone, or lives in someone's terminal scrollback.",
      },
      { type: "h2", text: "What is recorded" },
      {
        type: "ul",
        items: [
          "Each create, update, and restore produces a new version number.",
          "Versions store the encrypted value, never plain text.",
          "Writes are guarded so two people changing the same secret at once cannot silently overwrite each other.",
          "Viewing an old value is recorded in the audit log.",
        ],
      },
      { type: "h2", text: "Restoring a value" },
      {
        type: "p",
        text: "Restoring version 3 does not rewind history. It creates a new latest version containing the value from version 3, and every earlier version stays in place. The audit log records the restore and which version it came from.",
      },
      { type: "h2", text: "A note on secrets that leaked" },
      {
        type: "p",
        text: "History helps you recover from mistakes. It does not make a leaked credential safe. If a secret has been exposed, change it at the provider that issued it, then update Keel. See [how to keep secrets out of Git repositories](/blog/keep-secrets-out-of-git-repositories) for the full cleanup order.",
      },
    ],
    faq: [
      {
        q: "Can I see the old values?",
        a: "Yes, if your role allows reading secrets in that environment. Viewing an earlier version is recorded in the audit log.",
      },
      {
        q: "Does restoring delete the newer versions?",
        a: "No. A restore adds a new version with the older value. Nothing is removed.",
      },
      {
        q: "What about secrets created before versioning existed?",
        a: "Their current value becomes version 1. No earlier history is invented.",
      },
    ],
    relatedArticles: [
      "how-to-store-api-keys-securely",
      "common-secrets-management-mistakes",
    ],
    relatedFeatures: ["audit-logging", "secrets-management"],
  },
  {
    slug: "access-control",
    title: "Role-based access control for secrets",
    metaTitle: "Role-Based Access Control for Secrets",
    description:
      "Give people the least access they need with project roles and per-environment grants, enforced on the server for every request.",
    label: "Access control",
    summary:
      "Owner, admin, member, and viewer roles, plus explicit per-environment grants.",
    updated: "2026-10-11",
    intro:
      "Keel decides access in two steps: what your role allows, and which environments you have been given. Both must pass before a value is read.",
    body: [
      { type: "h2", text: "Roles" },
      {
        type: "ul",
        items: [
          "**Owner and admin** can manage members, invitations, environments, and integrations, and can read the audit log. Both have access to every environment.",
          "**Member** can read, create, update, and delete secrets in environments they have been granted.",
          "**Viewer** can read secrets in environments they have been granted and cannot change anything.",
        ],
      },
      { type: "h2", text: "Environment access" },
      {
        type: "p",
        text: "Members and viewers start with no environment access. An admin grants Development to the contractor, Staging to the QA engineer, and Production only to the people who deploy. A grant never raises a role, so a viewer with a Production grant is still read-only. Production is not special-cased: every environment is deny by default for members and viewers.",
      },
      { type: "h2", text: "Enforced on the server" },
      {
        type: "p",
        text: "The check runs in the API before any secret is read or decrypted, not in the interface. Environments you cannot access are omitted from project responses, and denied attempts are recorded in the [audit log](/features/audit-logging).",
      },
      { type: "h2", text: "Inviting people" },
      {
        type: "p",
        text: "Invitations are bound to an email address, and the invitation token travels in the link fragment so it does not appear in server request logs. Pending invitations can be revoked.",
      },
    ],
    faq: [
      {
        q: "Can I restrict someone to a single secret?",
        a: "Not at the moment. Access is set per role and per environment, not per individual secret.",
      },
      {
        q: "Do admins see Production by default?",
        a: "Yes. Owners and admins have implicit access to all environments, because they can grant themselves access anyway.",
      },
      {
        q: "Is single sign-on supported?",
        a: "Sign-in is handled by Clerk. Keel itself does not add its own SSO configuration.",
      },
    ],
    relatedArticles: ["common-secrets-management-mistakes", "what-is-secrets-management"],
    relatedFeatures: ["audit-logging", "secrets-management"],
  },
  {
    slug: "audit-logging",
    title: "Audit logging for secret access and changes",
    metaTitle: "Audit Logging for Secrets",
    description:
      "See who created, read, changed, exported, or was denied access to a secret, with an append-only record you can filter by category.",
    label: "Audit logging",
    summary:
      "An append-only record of secret changes, reveals, exports, and access decisions.",
    updated: "2026-10-11",
    intro:
      "When something goes wrong with a credential, the first question is who touched it and when. Keel records the answer as it happens.",
    body: [
      { type: "h2", text: "What is recorded" },
      {
        type: "ul",
        items: [
          "**Secrets:** created, updated, deleted, revealed, an old version viewed, rolled back, imported, exported.",
          "**Access:** role changes, members removed or leaving, invitations created, accepted, or revoked, environment grants and revocations, and denied access attempts.",
          "**Project:** created, updated, deleted.",
          "**Integrations:** connected, updated, disconnected, synced, and deploy triggered.",
        ],
      },
      { type: "h2", text: "What is never recorded" },
      {
        type: "p",
        text: "Secret values, invitation tokens, and token hashes are kept out of audit metadata by design. The log tells you what happened and who did it, without becoming a second place where secrets live.",
      },
      { type: "h2", text: "Using the log" },
      {
        type: "p",
        text: "Owners and admins can open the audit log for a project, filter by category (secrets, access, project, integrations), and page through events. Each entry carries the actor, the target, and a timestamp. Repeated denied attempts by the same person on the same environment are de-duplicated over a short window so a retry loop does not bury everything else.",
      },
      { type: "h2", text: "Limits" },
      {
        type: "p",
        text: "The log lives in the Keel database. There is no export to an external SIEM and no configurable retention policy yet.",
      },
    ],
    faq: [
      {
        q: "Who can read the audit log?",
        a: "Project owners and admins.",
      },
      {
        q: "Does the log contain secret values?",
        a: "No. Values and tokens are excluded from audit metadata.",
      },
      {
        q: "Can I stream events to another system?",
        a: "Not currently. The log is available in the dashboard and through the project's audit API.",
      },
    ],
    relatedArticles: ["common-secrets-management-mistakes", "what-is-secrets-management"],
    relatedFeatures: ["access-control", "secret-versioning"],
  },
];

export const featureBySlug = (slug: string) =>
  features.find((f) => f.slug === slug);
