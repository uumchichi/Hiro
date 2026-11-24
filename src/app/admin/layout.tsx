import type { Metadata } from "next";

// 운영자 화면은 검색에 나오지 않게 하고, 사이트 어디에서도 링크하지 않아요.
export const metadata: Metadata = {
  title: "운영자 — 히로",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
