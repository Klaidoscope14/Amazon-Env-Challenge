import type { NextConfig } from "next";

// Every build must say which stack it talks to (no defaults baked into the
// code). NEXT_PUBLIC_API_URL may be empty (same-origin hosting behind CloudFront).
const required = {
  NEXT_PUBLIC_API_URL: { allowEmpty: true },
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: { allowEmpty: false },
  NEXT_PUBLIC_COGNITO_CLIENT_ID: { allowEmpty: false },
};
const missing = Object.entries(required)
  .filter(([name, { allowEmpty }]) => {
    const value = process.env[name];
    return value === undefined || (!allowEmpty && value.trim() === "");
  })
  .map(([name]) => name);
if (missing.length > 0) {
  throw new Error(
    `Missing build settings: ${missing.join(", ")}. Set them in frontend/.env.local ` +
      "or the hosting provider's build variables (see frontend/.env.example)."
  );
}

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
