import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Types are checked locally via `pnpm tsc --noEmit`
    // Skipped in CI builds due to @fashun/shared dist resolution in Turbo remote cache
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
