import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Node.js output separate from Vinext's generated compatibility types.
  distDir: '.next-node',
};

export default nextConfig;
