import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import LegalPage, { type LegalSection } from "../components/LegalPage";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The terms that apply when you use Keel.",
  path: "/terms",
});

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Accepting these terms",
    body: (
      <p>
        Keel is a HoardSpace product. By creating an account or using Keel you
        agree to these terms. If you
        use Keel on behalf of an organisation, you confirm you are allowed to
        accept them for that organisation.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <ul>
        <li>Give accurate information and keep your sign-in details secure.</li>
        <li>You are responsible for activity that happens under your account.</li>
        <li>Tell us promptly if you suspect unauthorised access.</li>
      </ul>
    ),
  },
  {
    id: "content",
    title: "Your content",
    body: (
      <>
        <p>
          You keep ownership of the secrets and other content you store in
          Keel. You give us only the permission needed to store, encrypt,
          process, and deliver it as part of the service.
        </p>
        <p>
          Project owners and admins are responsible for who is invited, which
          roles they hold, and which environments they can reach.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>break the law or store content you have no right to hold;</li>
          <li>attempt to access projects or data you have not been given;</li>
          <li>probe, overload, or disrupt the service or its security;</li>
          <li>reverse engineer or resell the service without permission; or</li>
          <li>use automated means to create accounts or send bulk messages.</li>
        </ul>
      </>
    ),
  },
  {
    id: "integrations",
    title: "CLI and integrations",
    body: (
      <p>
        The command line tool and integrations such as Vercel act with the
        permissions you grant them. You are responsible for the access you
        authorise and for the terms of any third-party service you connect.
      </p>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep Keel available and secure, but we do not promise it
        will be uninterrupted or error free. We may change or remove features,
        and will try to give notice of changes that significantly affect you.
        Keep your own copy of any secret you cannot afford to lose.
      </p>
    ),
  },
  {
    id: "fees",
    title: "Pricing",
    body: (
      <p>
        Keel is currently free to use. If that changes we will tell you in
        advance, and you will be able to export your secrets and leave.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <p>
        You can stop using Keel and delete your projects at any time. We may
        suspend or end access if these terms are broken or if needed to
        protect the service and other users.
      </p>
    ),
  },
  {
    id: "disclaimer",
    title: "Disclaimers",
    body: (
      <p>
        Keel is provided as is and as available, without warranties of any
        kind to the extent the law allows, including fitness for a particular
        purpose and non-infringement.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the extent the law allows, Keel and its team are not liable for
        indirect, incidental, or consequential losses, or for loss of data,
        profits, or business arising from your use of the service.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. The date at the top shows the latest
        revision. Continuing to use Keel after a change means you accept the
        updated terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? <Link href="/contact">Send us a message</Link>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="The terms that apply when you use Keel."
      updated="10 October 2026"
      sections={sections}
    />
  );
}
