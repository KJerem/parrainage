import type { NextConfig } from "next";

// Origine publique du stockage S3 : /api/media/:id redirige (302) vers une URL présignée, et le
// navigateur y dépose directement les pièces jointes (PUT présignés de /api/uploads).
const mediaOrigin = new URL(process.env.S3_PUBLIC_ENDPOINT ?? "http://localhost:9000").origin;

// CSP en mode « Report-Only » pendant le développement ; elle sera appliquée (avec nonce)
// lors du durcissement final.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${mediaOrigin}`,
  `media-src 'self' blob: ${mediaOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${mediaOrigin}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self'",
].join("; ");

// Adresse interne de l'API NestJS. Le navigateur ne la voit jamais : il appelle /api/* sur
// l'origine du web, ce qui garde les cookies de session « first-party ».
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Toujours la dernière version du service worker.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
