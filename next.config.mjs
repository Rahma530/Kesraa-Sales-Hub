/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a trimmed, self-contained build in .next/standalone that only
  // includes the node_modules each page actually needs — instead of the
  // full node_modules folder (puppeteer/Chromium included). This is what
  // keeps the Hostinger Archive Upload zip small; see README deploy notes.
  output: "standalone",
  experimental: {
    // Next.js 14: externalize server-only packages from client bundle
    serverComponentsExternalPackages: [
      "whatsapp-web.js",
      "puppeteer",
      "puppeteer-core",
    ],
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer }) => {
    // Prevent webpack from bundling Node.js-only packages on any side
    config.externals = [
      ...(config.externals || []),
      "whatsapp-web.js",
      "puppeteer",
      "@aws-sdk/client-s3",
      "fluent-ffmpeg",
    ];
    return config;
  },
};

export default nextConfig;
