import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import SecretEcosystem from "./components/SecretEcosystem";
import ProductShowcase from "./components/ProductShowcase";
import WorkflowDiagram from "./components/WorkflowDiagram";
import DeveloperExperience from "./components/DeveloperExperience";
import SecuritySection from "./components/SecuritySection";
import ArchitectureDiagram from "./components/ArchitectureDiagram";
import FinalCTA from "./components/FinalCTA";
import Footer from "./components/Footer";
import Reveal from "./components/Reveal";
import LearnMore from "./components/LearnMore";
import HomeFaq from "./components/HomeFaq";
import JsonLd from "./components/JsonLd";
import type { Metadata } from "next";
import {
  absoluteUrl,
  ORGANIZATION_ID,
  PUBLISHER_NAME,
  SITE_NAME,
  WEBSITE_ID,
} from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: PUBLISHER_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/keel-brand-assets/keel-icon.png"),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    publisher: { "@id": ORGANIZATION_ID },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    description:
      "A secrets manager for developers: encrypted storage for API keys and environment variables, separated by environment, with role-based access, version history, and audit logging.",
    publisher: { "@id": ORGANIZATION_ID },
  },
];

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Reveal>
          <SecretEcosystem />
        </Reveal>
        <Reveal>
          <ProductShowcase />
        </Reveal>
        <Reveal>
          <WorkflowDiagram />
        </Reveal>
        <Reveal>
          <DeveloperExperience />
        </Reveal>
        <Reveal>
          <SecuritySection />
        </Reveal>
        <Reveal>
          <ArchitectureDiagram />
        </Reveal>
        <Reveal>
          <LearnMore />
        </Reveal>
        <Reveal>
          <HomeFaq />
        </Reveal>
        <Reveal>
          <FinalCTA />
        </Reveal>
      </main>
      <Footer />
      <JsonLd data={structuredData} />
    </>
  );
}
