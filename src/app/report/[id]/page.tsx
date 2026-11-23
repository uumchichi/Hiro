"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { MemberCard } from "@/components/MemberCard";
import { fmtRemain } from "@/components/time";
import type { PublicMember } from "@/lib/server";

interface Report {
  id: string;
  theme: { title: string; emoji: string };
  done: boolean;
  received: { index: number; text: string; owner: PublicMember | null }[];
  receivedCount: number | null;
  revealedIndex: number | null;
  mutual: boolean;
  chat: { id: string; expiresAt: number } | null;
  people: { member: PublicMember; letter: string; memo: string }[];
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/report/${id}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setR(d);
    else setErr(d.error ?? "리포트를 불러오지 못했어요.");
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // 상대가 나중에 주인 찾기를 하면 매칭이 생길 수 있어요
    return () => clearInterval(t);
  }, [load]);

  async function reveal(index: number) {
    setBusy(true);
    const res = await fetch(`/api/report/${id}/reveal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setErr(d.error ?? "실패했어요.");
    setConfirmIdx(null);
    setBusy(false);
    load();
  }

  if (err && !r) return <p className="pt-10 text-center text-muted">{err}</p>;
  if (!r) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;

  const owner = r.revealedIndex !== null ? r.received[r.revealedIndex]?.owner : null;
  const sentToOwner = owner ? Boolean(r.people.find((p) => p.member.id === owner.id)?.letter) : false;
  const sent = r.people.filter((p) => p.letter).length;
  const memos = r.people.filter((p) => p.memo).length;

  return (
    <div className="space-y-6 pt-4">
      <section className="relative overflow-hidden rounded-[2rem] bg-hiro px-6 py-8 text-white">
        <span className="orb -right-8 -top-8 h-32 w-32" aria-hidden />
        <p className="relative text-sm font-semibold text-white/85">로테이션 리포트</p>
        <h1 className="relative mt-1 text-2xl font-extrabold">
          {r.theme.emoji} {r.theme.title}
        </h1>
        <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["받은 쪽지", r.receivedCount ?? 0],
            ["보낸 쪽지", sent],
            ["만난 사람", r.people.length],
          ].map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-white/15 px-2 py-3 backdrop-blur">
              <p className="text-2xl font-extrabold tabular-nums">{n}</p>
              <p className="text-xs text-white/85">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {err && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">{err}</p>}

      {/* 매칭 */}
      {r.mutual && r.chat && (
        <section className="card space-y-3 border-brand text-center">
          <p className="text-4xl">💞</p>
          <h2 className="text-xl font-extrabold">서로의 쪽지 주인을 찾았어요!</h2>
          <p className="text-sm text-muted">둘만의 채팅방이 열렸어요. 채팅방은 {fmtRemain(r.chat.expiresAt - Date.now())} 뒤 자동으로 사라져요.</p>
          <Link href={`/chat/${r.chat.id}`} className="btn-primary">
            채팅방 열기
          </Link>
        </section>
      )}

      {/* 받은 쪽지 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">💌 받은 쪽지 {r.receivedCount ?? 0}개</h2>
          <p className="text-sm text-muted">
            쪽지는 익명이에요. 단 <b>한 개</b>만 골라 주인을 확인할 수 있어요. 서로가 서로의 쪽지 주인을 찾으면 24시간 동안 둘만의 채팅방이 열려요.
          </p>
        </div>
        {r.received.length === 0 && <p className="card text-center text-muted">이번엔 받은 쪽지가 없어요. 다음 만남을 기대해요!</p>}
        {r.received.map((l) => (
          <div key={l.index} className={`card space-y-3 ${l.owner ? "border-brand" : ""}`}>
            <p className="text-xs font-semibold text-muted">{l.owner ? "주인을 찾은 쪽지" : `익명의 쪽지 #${l.index + 1}`}</p>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">“{l.text}”</p>
            {l.owner && <MemberCard m={l.owner} highlight />}
            {r.revealedIndex === null && (
              <button className="btn-ghost w-full text-sm" onClick={() => setConfirmIdx(l.index)}>
                🔎 이 쪽지의 주인 찾기
              </button>
            )}
          </div>
        ))}
        {owner && !r.mutual && (
          <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm">
            {sentToOwner
              ? `${owner.nickname}님도 내 쪽지의 주인을 찾으면 둘만의 채팅방이 열려요.`
              : `${owner.nickname}님에게는 쪽지를 보내지 않아서, 이번에는 매칭으로 이어지지 않아요.`}
          </p>
        )}
      </section>

      {/* 메모 리포트 */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">📝 내 메모 리포트</h2>
          <p className="text-sm text-muted">
            만난 사람 {r.people.length}명 · 메모 {memos}개 · 보낸 쪽지 {sent}개. 메모와 보낸 쪽지는 나만 볼 수 있어요.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {r.people.map((p) => (
            <MemberCard key={p.member.id} m={p.member}>
              <div className="mt-3 space-y-2 text-sm">
                <p className={p.memo ? "whitespace-pre-wrap" : "text-muted"}>📝 {p.memo || "메모 없음"}</p>
                {p.letter && <p className="whitespace-pre-wrap text-muted">💌 보낸 쪽지: {p.letter}</p>}
              </div>
            </MemberCard>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/lobby" className="btn-primary">
          대기실로
        </Link>
        <Link href="/records" className="btn-ghost">
          내 기록
        </Link>
      </div>

      {confirmIdx !== null && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-4 rounded-[2rem] bg-surface p-6 text-center shadow-2xl">
            <p className="text-3xl">🔎</p>
            <p className="text-lg font-bold">이 쪽지의 주인을 확인할까요?</p>
            <p className="text-sm text-muted">주인 찾기는 이번 로테이션에서 <b>단 한 번</b>만 할 수 있어요.</p>
            <div className="grid grid-cols-2 gap-3">
              <button className="btn-ghost" onClick={() => setConfirmIdx(null)}>
                취소
              </button>
              <button className="btn-primary" disabled={busy} onClick={() => reveal(confirmIdx)}>
                확인하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
