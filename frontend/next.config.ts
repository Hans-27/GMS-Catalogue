import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// Resolve the server-side proxy target from the runtime environment.
const internalApiUrl = (
  process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8001/api"
).replace(/\/$/, "");
const internalBackendOrigin = new URL(internalApiUrl).origin;

function getAllowedDevelopmentHosts(): string[] {
  const hosts = new Set(["127.0.0.1", "localhost"]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.family === "IPv4") {
        hosts.add(address.address);
      }
    }
  }

  if (process.env.PUBLIC_APP_URL) {
    try {
      hosts.add(new URL(process.env.PUBLIC_APP_URL).hostname);
    } catch {
      // The launcher validates PUBLIC_APP_URL; ignore an invalid manually supplied value here.
    }
  }

  return [...hosts];
}

const nextConfig: NextConfig = {
  agentRules: false,
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: getAllowedDevelopmentHosts(),
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        {
          source: "/api/:path*",
          destination: `${internalApiUrl}/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${internalBackendOrigin}/uploads/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
