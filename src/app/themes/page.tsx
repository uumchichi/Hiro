"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro, useTick } from "@/components/useHiro";
import { fmtUntil, fmtWhen, useSlots, type SlotView } from "@/components/useSlots";
import { estimateRange } from "@/lib/estimate";
import { apiFetch } from "@/lib/api";

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
    const res = await apiFetch("/api/slots/apply", {
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
  const curated = board.filter((s) => s.curated);

  const card = (s: SlotView) => {
    const full = Boolean(s.capacity && s.applicants >= s.capacity && !s.applied);
    const ratio = s.capacity ? Math.min(1, s.applicants / s.capacity) : Math.min(1, s.applicants / data.config.min);
    const est = estimateRange(data.config.min, data.config.max, s.roundSeconds, data.config.breakSeconds);
    return (
      <div key={s.id} className={`card flex flex-col gap-3 ${s.curated ? "border-[var(--mid)]" : ""}`}>
        {s.curated && <span className="self-start rounded-full bg-hiro px-2.5 py-0.5 text-xs font-bold text-white">✨ 운영진 기획</span>}
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
        <p className="rounded-2xl bg-bg px-3 py-2 text-xs text-muted">
          ⏱️ 예상: {est.text}
          <span className="block">🎟️ 1:1 대화 1번에 입장권 1장 (최대 {data.config.max - 1}장 예치, 남은 건 돌려드려요)</span>
        </p>
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-hiro" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {s.capacity ? `신청 ${s.applicants}/${s.capacity}명` : `신청 ${s.applicants}명`} ·{" "}
            {full ? "정원이 다 찼어요" : s.applicants >= data.config.min ? "진행 가능 인원이 모였어요" : `${data.config.min}명 이상이면 진행돼요`}
          </p>
        </div>
        <button className={s.applied ? "btn-ghost" : "btn-primary"} disabled={busy === s.id || full} onClick={() => apply(s, !s.applied)}>
          {s.applied ? "신청 취소" : full ? "마감" : "신청하기"}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">이벤트 세션</h1>
        <p className="mt-1 text-muted">
          정해진 시간에 열리는 특별 세션이에요. 지금 바로 대화하고 싶다면 <Link href="/lobby" className="font-semibold text-brand underline">대기실</Link>에서 AI 초대장을 받아 보세요. 마음에 드는 세션을 여러 개 신청해 두세요. 시작 {data.config.checkinMinutes}분 전부터 입장할 수 있고,
          시작 시간에 입장해 있는 분들이 {data.config.min}~{data.config.max}명씩 그룹이 되어 대화를 시작해요.
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
                <Link href={`/waiting?slot=${s.id}`} className="btn-primary">입장하기</Link>
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

      {curated.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">✨ 운영진 기획 이벤트</h2>
          <div className="grid gap-3 sm:grid-cols-2">{curated.map(card)}</div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">예정된 이벤트</h2>
        <div className="grid gap-3 sm:grid-cols-2">{board.filter((s) => !s.curated).map(card)}</div>
      </section>
    </div>
  );
}
