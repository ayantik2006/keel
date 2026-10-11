import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Raleway, Geist_Mono, DM_Serif_Display } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import SideRails from "./components/SideRails";
import { OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/site";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
});

const display = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: "italic",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Keel is a secrets manager for developers. Store API keys and environment variables once, separate them by environment, control who can read them, and keep a history of every change.";

export const metadata: Metadata = {
  // Resolves every relative metadata URL (canonical, social images).
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Keel: Secrets Management for Developers",
    template: "%s | Keel",
  },
  description,
  applicationName: SITE_NAME,
  // Each page sets its own canonical path through pageMetadata().
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Keel: Secrets Management for Developers",
    description,
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Keel: Secrets Management for Developers",
    description,
    images: [OG_IMAGE.url],
  },
  // Set GOOGLE_SITE_VERIFICATION to the token from Search Console (HTML tag method).
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${raleway.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-K87XDEQPCV"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-K87XDEQPCV');
          `}
        </Script>
        <ClerkProvider>
          <SideRails />
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}