import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "https://nxtgen-stack.com/nxtgen-convert/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
