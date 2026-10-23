import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  // A self-contained server in .next/standalone, for running the site in a
  // container (see /Dockerfile). Tracing starts at the workspace root, where
  // pnpm keeps the installed packages. On Vercel the folder is simply unused.
  output: "standalone",
  experimental: {
    outputFileTracingRoot: path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
  },
  async headers() {
    // Self-hosted, nothing in front of the app adds these. Nothing embeds the
    // site, so framing is refused outright (wallet sign-in and the admin page
    // must never sit inside someone else's frame). Browsers ignore HSTS on
    // plain-HTTP addresses, so local and temporary hosts are unaffected.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
        ],
      },
    ];
  },
  async redirects() {
    // The site lives at www.writ.fi. On production builds, any *.vercel.app
    // address of this project (writ2.vercel.app and the per-deployment URLs)
    // forwards there, so there is no second copy of the site to stumble on.
    // Preview builds keep their own URLs for testing.
    // Vercel Cron calls the deployment's own URL, which may be a vercel.app
    // host; the keeper route is left out so a redirect never swallows it.
    if (process.env.VERCEL_ENV !== "production") return [];
    return [
      {
        source: "/:path((?!api/cron/).*)",
        has: [{ type: "host", value: ".+\\.vercel\\.app" }],
        destination: "https://www.writ.fi/:path",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      // COMING_SOON=true serves the splash at / while every other route stays
      // reachable. beforeFiles is required: / is a real page and would win otherwise.
      beforeFiles:
        process.env.COMING_SOON === "true" ? [{ source: "/", destination: "/coming-soon" }] : [],
    };
  },
};

export default nextConfig;
