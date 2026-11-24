"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicMember } from "@/lib/server";
import { apiFetch } from "@/lib/api";

interface Records {
  now: number;
  groups: { id: string; theme: { title: string; emoji: string }; finishedAt: number; received: number; revealed: boolean }[];
  chats: { id: string; other: PublicMember; expiresAt: number; last: { text: string; mine: boolean } | null }[];
}

export default function RecordsPage() {
  const [r, setR] = useState<Records | null>(null);
  useEffect(() => {
    const load = () =>
      apiFetch("/api/records", { cache: "no-store" })
        .then((res) => res.json())
        .then(setR)
        .catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);
  if (!r) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;

  return (
    <div className="space-y-6 pt-4">
      <h1 className="text-2xl font-extrabold">내 기록</h1>

      <Link href="/chats" className="card flex items-center justify-between gap-3">
        <span className="font-bold">💞 채팅방</span>
        <span className="text-sm text-muted">{r.chats.length ? `${r.chats.length}개 열려 있어요 →` : "열린 채팅방 없음 →"}</span>
      </Link>

      <section className="space-y-3">
        <h2 className="font-bold">📋 로테이션 리포트</h2>
        {r.groups.length === 0 && <p className="text-sm text-muted">아직 끝난 로테이션이 없어요.</p>}
        {r.groups.map((g) => (
          <Link key={g.id} href={`/report?id=${g.id}`} className="card flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">
                {g.theme.emoji} {g.theme.title}
              </p>
              <p className="text-sm text-muted">{new Date(g.finishedAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">💌 {g.received}개</p>
              <p className="text-xs text-muted">{g.revealed ? "주인 찾기 완료" : g.received ? "주인 찾기 가능" : ""}</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
