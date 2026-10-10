import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import LegalPage, { type LegalSection } from "../components/LegalPage";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What Keel collects, how it is protected, and the choices you have.",
  path: "/privacy",
});

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    body: (
      <p>
        Keel is a HoardSpace product: a place to store and share secrets such
        as API keys and credentials. Because of that, we collect as little as we can and keep
        secret values encrypted. This page explains what we handle and why.
      </p>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Account details.</strong> Your name and email address, and
          the sign-in method you use, handled through our authentication
          provider.
        </li>
        <li>
          <strong>Workspace content.</strong> Projects, environments, secret
          keys, encrypted secret values and their version history, members, and
          roles.
        </li>
        <li>
          <strong>Activity records.</strong> Audit events that record who did
          what and when. Secret values are never written to audit events.
        </li>
        <li>
          <strong>Messages you send us.</strong> The name, email, company,
          topic, and message you submit through the contact form.
        </li>
        <li>
          <strong>Technical data.</strong> Your network address is used briefly
          to rate limit requests. It is held in memory and not stored in your
          workspace.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use it",
    body: (
      <>
        <p>We use your information to:</p>
        <ul>
          <li>provide, secure, and operate Keel;</li>
          <li>authenticate you and enforce project roles and environment access;</li>
          <li>show you an audit trail of activity in your projects;</li>
          <li>reply to the messages you send us; and</li>
          <li>prevent abuse and keep the service reliable.</li>
        </ul>
        <p>We do not sell your information or use it for advertising.</p>
      </>
    ),
  },
  {
    id: "protection",
    title: "How secrets are protected",
    body: (
      <ul>
        <li>
          Secret values are encrypted with AES-256-GCM before they are stored.
          The encryption key is kept in the server environment, not in the
          database.
        </li>
        <li>
          Values are decrypted only when an authorised person reveals, exports,
          or syncs them, and each of those actions is recorded without the
          value itself.
        </li>
        <li>
          Access is limited by project role and by the environments a member
          has been granted.
        </li>
      </ul>
    ),
  },
  {
    id: "providers",
    title: "Service providers",
    body: (
      <>
        <p>We rely on a small number of providers to run Keel:</p>
        <ul>
          <li>
            <strong>Authentication.</strong> Clerk handles sign-in, sessions,
            and your account profile.
          </li>
          <li>
            <strong>Database hosting.</strong> Your workspace data is stored in
            MongoDB.
          </li>
          <li>
            <strong>Integrations you enable.</strong> If you connect Vercel,
            the secrets you choose to sync are sent to your Vercel project.
          </li>
        </ul>
        <p>
          These providers process data only to deliver their part of the
          service.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention and deletion",
    body: (
      <>
        <p>
          You can delete secrets and projects from the dashboard at any time.
          Deleting a project removes its secrets, version history, members,
          invitations, and integration settings.
        </p>
        <p>
          Messages sent through the contact form are kept for as long as
          needed to respond and follow up.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        Keel uses cookies that are necessary to keep you signed in and secure.
        We do not use advertising or cross-site tracking cookies.
      </p>
    ),
  },
  {
    id: "choices",
    title: "Your choices",
    body: (
      <p>
        You can update your profile from your account settings, remove secrets
        and projects yourself, and leave any project you belong to. To ask
        about access to, correction of, or deletion of your personal data,{" "}
        <Link href="/contact">contact us</Link>.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this page",
    body: (
      <p>
        We may update this policy as Keel changes. The date at the top shows
        when it was last revised. Material changes will be announced in the
        product.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about privacy? <Link href="/contact">Send us a message</Link>{" "}
        and choose the security and compliance topic.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="What Keel collects, how it is protected, and the choices you have."
      updated="10 October 2026"
      sections={sections}
    />
  );
}
