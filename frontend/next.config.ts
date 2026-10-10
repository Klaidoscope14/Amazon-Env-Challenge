import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export (HTML/JS/CSS in `out/`), served from S3 through CloudFront.
  // Every page fetches its data in the browser, so no server is needed.
  output: "export",
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
