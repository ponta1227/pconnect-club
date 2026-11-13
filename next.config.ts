import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";

// ロゴ画像（public/logo.png）を置くと、仮のマークの代わりにそれを表示する。
const hasLogo = existsSync(join(process.cwd(), "public", "logo.png"));

// 全画面がログインユーザーごとの表示のため Cache Components は使わず、従来の動的レンダリングにする。
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_HAS_LOGO: hasLogo ? "1" : "" },
  // アプリアイコン（/icons/◯◯）がロゴ画像を読めるように、サーバー側にも含める
  outputFileTracingIncludes: { "/icons/*": ["./public/logo.png"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
