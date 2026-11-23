"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro, useTick } from "@/components/useHiro";
import { fmtUntil, fmtWhen, useSlots, type SlotView } from "@/components/useSlots";

export default function ThemesPage() {
  const router = useRouter();
  const { state } = useHiro();
  const { data, refresh, serverNow } = useSlots(5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useTick(15000);

  useEffect(() => {
    if (!state) return;
    if (!state.user.profile) router.replace("/start");
    else if (!state.user.analysis) router.replace("/quiz");
    else if (state.user.status === "grouped") router.replace("/room");
  }, [state, router]);

  async function apply(s: SlotView, on: boolean) {
    setBusy(s.id);
    setError(null);
    const res = await fetch("/api/slots/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId: s.id, on }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "실패했어요.");
    await refresh();
    setBusy(null);
  }

  if (!data) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const now = serverNow();
  const mine = data.slots.filter((s) => s.applied && (s.status === "open" || s.status === "forming"));
  const past = data.slots.filter((s) => s.applied && (s.status === "cancelled" || (s.status === "started" && s.missed)));
  const board = data.slots.filter((s) => s.status === "open");

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">테마 고르기</h1>
        <p className="mt-1 text-muted">
          마음에 드는 테마를 여러 개 신청해 두세요. 시작 {data.config.checkinMinutes}분 전부터 대기실에 들어갈 수 있고,
          시작 시간에 대기실에 있는 분들이 {data.config.min}~{data.config.max}명씩 그룹이 되어 대화를 시작해요.
        </p>
      </div>

      {error && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">{error}</p>}

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">내가 신청한 세션</h2>
          {mine.map((s) => (
            <div key={s.id} className="card flex flex-wrap items-center justify-between gap-3 border-brand">
              <div>
                <p className="font-bold">
                  {s.theme.emoji} {s.theme.title}
                </p>
                <p className="text-sm text-muted">
                  {fmtWhen(s.startsAt, now)} · {fmtUntil(s.startsAt - now)} · 신청 {s.applicants}명
                </p>
              </div>
              {s.canCheckIn ? (
                <Link href={`/lobby?slot=${s.id}`} className="btn-primary">대기실 입장</Link>
              ) : (
                <span className="text-sm text-muted">시작 {data.config.checkinMinutes}분 전부터 입장</span>
              )}
            </div>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          {past.map((s) => (
            <p key={s.id} className="rounded-2xl border border-line px-4 py-3 text-sm text-muted">
              {s.theme.emoji} {s.theme.title} ({fmtWhen(s.startsAt, now)}): {s.note ?? "참여하지 못했어요."}
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">열려 있는 테마</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {board.map((s) => {
            const ratio = Math.min(1, s.applicants / data.config.min);
            return (
              <div key={s.id} className="card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-2xl">{s.theme.emoji}</span>
                  <div className="min-w-0">
                    <p className="font-bold leading-snug">{s.theme.title}</p>
                    <p className="text-sm text-muted">{s.theme.description}</p>
                  </div>
                </div>
                <p className="text-sm font-semibold">
                  🕘 {fmtWhen(s.startsAt, now)} <span className="font-normal text-muted">({fmtUntil(s.startsAt - now)})</span>
                </p>
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-hiro" style={{ width: `${ratio * 100}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    신청 {s.applicants}명 · {s.applicants >= data.config.min ? "진행 가능 인원이 모였어요" : `${data.config.min}명 이상이면 진행돼요`}
                  </p>
                </div>
                <button
                  className={s.applied ? "btn-ghost" : "btn-primary"}
                  disabled={busy === s.id}
                  onClick={() => apply(s, !s.applied)}
                >
                  {s.applied ? "신청 취소" : "신청하기"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
