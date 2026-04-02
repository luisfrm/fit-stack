/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "r2.luisrivas.work",
      },
    ],
  },
};

export default nextConfig;
