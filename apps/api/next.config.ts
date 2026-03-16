import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // API-only: no pages dir, no image optimization needed
  output: "standalone",
};

export default nextConfig;
