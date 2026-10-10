import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page is a client component fetching from the API at runtime, so
  // Cache Components / partial prefetching add nothing here.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
