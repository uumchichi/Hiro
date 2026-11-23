import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "히로 Hiro — 여성 전용 로테이션 소개팅",
  description: "성향 분석과 AI 테마 매칭, 1:1 음성 로테이션으로 새로운 인연을 만나요.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9b5cff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-hiro text-white">H</span>
            히로
          </Link>
          <nav className="flex gap-4 text-sm text-muted">
            <Link href="/me" className="hover:text-ink">내 성향</Link>
            <Link href="/lobby" className="hover:text-ink">라운지</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
