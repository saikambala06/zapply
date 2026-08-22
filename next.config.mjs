/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Mongoose must stay a real Node module — bundling it breaks its driver.
  // (On Next 15+ this option is renamed to the top-level `serverExternalPackages`.)
  experimental: { serverComponentsExternalPackages: ["mongoose", "unpdf", "mammoth", "word-extractor"] },
  async headers() {
    return [
      {
        // The browser extension talks to these routes cross-origin.
        source: "/api/extension/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};
export default nextConfig;
