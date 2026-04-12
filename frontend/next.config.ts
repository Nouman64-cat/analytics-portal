import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/profiles", destination: "/resume-profiles", permanent: true },
    ];
  },
};

export default nextConfig;
