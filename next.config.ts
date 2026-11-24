import type { NextConfig } from "next";

// GitHub Pages용 정적 사이트로 만들 때(npm run build:static)만 켜져요.
// 평소 개발·서버 실행(npm run dev / build)은 그대로예요.
const isStatic = process.env.HIRO_STATIC === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
