import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    useWorkerForServer: false,
  },
};

export default nextConfig;