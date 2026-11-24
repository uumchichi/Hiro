"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportButton } from "@/components/ReportButton";
import { fmtRemain } from "@/components/time";
import type { PublicMember } from "@/lib/server";
import { apiFetch } from "@/lib/api";

interface ChatItem {
  id: string;
  other: PublicMember;
  expiresAt: number;
  last: { text: string; mine: boolean } | null;
}

/** 열려 있는 24시간 채팅방 모아 보기 */
export default function ChatsPage() {
  const [data, setData] = useState<{
    now: number;
    chats: ChatItem[];
    straights: { groupId: string; from: PublicMember; message: string; expiresAt: number }[];
  } | null>(null);
  const [offset, setOffset] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const load = () =>
      apiFetch("/api/records", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setOffset(d.now - Date.now());
          setData({ now: d.now, chats: d.chats, straights: d.straights ?? [] });
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    const t2 = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);

  if (!data) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const now = Date.now() + offset;
  const chats = [...data.chats].sort((a, b) => a.expiresAt - b.expiresAt);

  return (
    <div className="space-y-5 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">채팅</h1>
        <p className="mt-1 text-sm text-muted">서로의 쪽지 주인을 찾은 분과의 채팅방이에요. 각 채팅방은 열린 뒤 24시간이 지나면 대화 내용과 함께 사라져요.</p>
      </div>

      {data.straights.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">💘 받은 직진</h2>
          {data.straights.map((st) => (
            <Link key={st.groupId + st.from.id} href={`/report?id=${st.groupId}`} className="card flex items-center justify-between gap-3 border-[var(--tek)] !p-4">
              <div className="min-w-0">
                <p className="font-bold">
                  {st.from.emoji} {st.from.nickname}님이 직진했어요
                </p>
                <p className="truncate text-sm text-muted">{st.message || "수락하면 채팅방이 열려요"}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-brand">답하기 →</span>
            </Link>
          ))}
        </section>
      )}

      {chats.length === 0 ? (
        <div className="card space-y-3 text-center">
          <p className="text-4xl">💌</p>
          <p className="font-bold">아직 열린 채팅방이 없어요</p>
          <p className="text-sm text-muted">로테이션에서 쪽지를 보내고, 리포트에서 쪽지의 주인을 찾아 보세요. 서로 찾으면 채팅방이 열려요.</p>
          <Link href="/lobby" className="btn-primary">대기실로</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {chats.map((c) => {
            const remain = c.expiresAt - now;
            const soon = remain < 3 * 3600_000;
            return (
              <li key={c.id} className="card flex items-center gap-3 !p-4">
                <Link href={`/chat?id=${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-2xl"
                    style={c.other.tgColor ? { boxShadow: `0 0 0 3px ${c.other.tgColor}` } : undefined}
                  >
                    {c.other.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {c.other.nickname} <span className="font-mono text-[11px] font-semibold tracking-wider text-muted">#{c.other.code}</span>
                    </p>
                    <p className="truncate text-sm text-muted">{c.last ? `${c.last.mine ? "나: " : ""}${c.last.text}` : "첫 인사를 건네 보세요 👋"}</p>
                  </div>
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${soon ? "bg-brand text-brand-ink" : "bg-brand-soft text-brand"}`}>
                    ⏳ {fmtRemain(remain)}
                  </span>
                  <ReportButton code={c.other.code} nickname={c.other.nickname} context={`chat:${c.id}`} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
