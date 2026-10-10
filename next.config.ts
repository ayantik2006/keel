import type { NextConfig } from "next";

// Pages that must never be indexed. Sent as a header so it also covers client
// components, which cannot export metadata.
const PRIVATE_PATHS = [
  "/dashboard/:path*",
  "/invite/:path*",
  "/cli/:path*",
  "/sign-in/:path*",
  "/sign-up/:path*",
  "/api/:path*",
];

const nextConfig: NextConfig = {
  async headers() {
    return PRIVATE_PATHS.map((source) => ({
      source,
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    }));
  },
};

export default nextConfig;
