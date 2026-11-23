"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHiro, useTick } from "@/components/useHiro";
import { fmtUntil } from "@/components/useSlots";
import type { LobbyView } from "@/lib/lobby";
import { fmtSlotTime } from "@/lib/schedule";
import { estimateExact, estimateRange } from "@/lib/estimate";

/** 초대장이 오면 짧은 알림음 + 진동 + 탭 제목 */
function notify() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18);
      o.stop(ctx.currentTime + i * 0.18 + 0.18);
    });
  } catch {}
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
}

export default function LobbyPage() {
  const router = useRouter();
  const { state } = useHiro(4000);
  const [view, setView] = useState<LobbyView | null>(null);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seenInvite = useRef<string | null>(null);
  const seenScheduled = useRef<Set<string>>(new Set());
  const joinedOnce = useRef(false);
  useTick(500);

  const apply = useCallback((v: LobbyView) => {
    setOffset(v.now - Date.now());
    setView(v);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/lobby", { cache: "no-store" });
      if (res.ok) apply(await res.json());
    } catch {}
  }, [apply]);

  const send = useCallback(
    async (url: string, body: unknown) => {
      setBusy(true);
      setErr(null);
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (d.now) apply(d);
      if (!res.ok) setErr(d.error ?? "문제가 생겼어요.");
      setBusy(false);
    },
    [apply],
  );

  // 검사 전이면 돌려보내고, 그룹이 정해지면 대화방으로
  useEffect(() => {
    if (!state) return;
    if (!state.user.profile) router.replace("/start");
    else if (!state.user.analysis) router.replace("/quiz");
    else if (state.user.status === "grouped") router.replace("/room");
  }, [state, router]);

  // 대기실 화면에 들어오면 자동으로 입장
  useEffect(() => {
    if (!state?.user.analysis || state.user.status === "grouped" || joinedOnce.current) return;
    joinedOnce.current = true;
    send("/api/lobby", { action: "join" });
  }, [state, send]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  // 새 초대장 알림
  const invite = view?.invite;
  useEffect(() => {
    if (invite && invite.status === "open" && !invite.iAccepted && seenInvite.current !== invite.id) {
      seenInvite.current = invite.id;
      notify();
    }
    document.title = invite && invite.status === "open" && !invite.iAccepted ? "💌 초대장이 왔어요 · 히로" : "히로 Hiro";
  }, [invite]);

  // 새 예약 초대장 알림 (한 번만)
  useEffect(() => {
    for (const s of view?.scheduled ?? []) {
      if (!s.iAccepted && !seenScheduled.current.has(s.id)) {
        seenScheduled.current.add(s.id);
        notify();
      }
    }
  }, [view?.scheduled]);

  useEffect(() => {
    if (invite?.iGotIn) router.replace("/room");
  }, [invite?.iGotIn, router]);

  if (!view) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const now = Date.now() + offset;

  function toggleInterest(id: string) {
    const next = view!.interests.includes(id) ? view!.interests.filter((x) => x !== id) : [...view!.interests, id];
    send("/api/lobby", { action: "interests", interests: next });
  }

  const left = invite ? Math.max(0, invite.expiresAt - now) : 0;
  const ttl = view.config.inviteSeconds * 1000;

  return (
    <div className="space-y-5 pt-4">
      <section className="relative overflow-hidden rounded-[2rem] bg-hiro px-6 py-8 text-white">
        <span className="orb -right-8 -top-8 h-32 w-32" aria-hidden />
        <div className="relative space-y-3">
          <p className="text-sm font-semibold text-white/85">대기실</p>
          <h1 className="text-2xl font-extrabold leading-snug">
            {view.inLobby ? "AI가 잘 맞는 사람들을 찾고 있어요" : "잠시 쉬는 중이에요"}
          </h1>
          <p className="text-white/90">
            {view.inLobby
              ? `서로 조건이 맞는 분들이 모이면 초대장이 와요. ${view.config.inviteSeconds}초 안에 수락하면, 선착순 ${view.config.min}~${view.config.max}명이 바로 1:1 음성 로테이션을 시작해요.`
              : "다시 대화할 준비가 되면 대기실에 들어오세요."}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold backdrop-blur">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#5dffb0]" />
              지금 대기실 {view.online}명
            </span>
            {view.inLobby ? (
              <button className="btn border border-white/50 py-2 text-sm text-white hover:bg-white/10" disabled={busy} onClick={() => send("/api/lobby", { action: "leave" })}>
                잠깐 쉬기
              </button>
            ) : (
              <button className="btn bg-white py-2 text-sm text-[#6b2fd6]" disabled={busy} onClick={() => send("/api/lobby", { action: "join" })}>
                대기실 들어가기
              </button>
            )}
          </div>
        </div>
      </section>

      {view.note && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">💌 {view.note}</p>}
      {view.priority > 0 && view.inLobby && <p className="text-sm text-muted">⭐ 우선권 {view.priority}개: 다음 초대장을 먼저 받아요.</p>}
      {err && <p className="text-sm font-semibold text-brand">{err}</p>}

      {(view.scheduled.length > 0 || view.reservations.length > 0 || !view.hasAvailability) && (
        <section className="card space-y-4">
          <div>
            <h2 className="text-lg font-bold">📅 예약 초대장</h2>
            <p className="text-sm text-muted">선호 시간대가 겹치는 분들과 특정 시간에 만나는 초대예요. 선착순 {view.config.min}~{view.config.max}명이 수락하면 확정돼요.</p>
          </div>
          {!view.hasAvailability && (
            <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm">
              <Link href="/start" className="font-semibold text-brand underline">프로필</Link>에서 선호하는 시간대를 고르면 예약 초대장을 받을 수 있어요.
            </p>
          )}
          {view.scheduled.map((s) => (
            <div key={s.id} className="rounded-2xl border border-brand p-4">
              <p className="text-sm font-bold text-brand">{s.startsAt ? fmtSlotTime(s.startsAt, now) : ""}</p>
              <p className="mt-1 font-bold">
                {s.theme.emoji} {s.theme.title}
              </p>
              <p className="text-sm text-muted">{s.theme.description}</p>
              <p className="mt-2 text-xs text-muted">
                {s.invited}명 초대 · {s.accepted}명 수락 · 수락 마감 {fmtUntil(s.expiresAt - now)}
              </p>
              <p className="mt-1 text-xs text-muted">
                ⏱️ 예상: {estimateRange(view.config.min, Math.min(view.config.max, s.invited), view.config.roundSeconds, view.config.breakSeconds).text}
              </p>
              {s.iAccepted ? (
                <p className="mt-3 text-sm font-semibold">수락했어요! {view.config.min}명 이상 모이면 예약이 확정돼요.</p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="btn-ghost py-2 text-sm" disabled={busy} onClick={() => send("/api/invites/respond", { inviteId: s.id, accept: false })}>
                    다음에요
                  </button>
                  <button className="btn-primary py-2 text-sm" disabled={busy} onClick={() => send("/api/invites/respond", { inviteId: s.id, accept: true })}>
                    이 시간에 참여
                  </button>
                </div>
              )}
            </div>
          ))}
          {view.reservations.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">확정된 예약</p>
              {view.reservations.map((r) => (
                <div key={r.slotId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-soft px-4 py-3">
                  <div>
                    <p className="text-sm font-bold">{fmtSlotTime(r.startsAt, now)}</p>
                    <p className="text-sm">
                      {r.theme.emoji} {r.theme.title} · {r.people}명
                    </p>
                    <p className="text-xs text-muted">⏱️ {estimateExact(r.people, r.roundSeconds, view.config.breakSeconds).text}</p>
                  </div>
                  <Link href={`/waiting?slot=${r.slotId}`} className="btn-primary py-2 text-sm">
                    {r.startsAt - now <= 10 * 60_000 ? "입장하기" : fmtUntil(r.startsAt - now)}
                  </Link>
                </div>
              ))}
              <p className="text-xs text-muted">시작 10분 전부터 입장할 수 있어요. 시간에 입장해 있는 분들끼리 시작해요.</p>
            </div>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <div>
          <h2 className="text-lg font-bold">관심 테마</h2>
          <p className="text-sm text-muted">고른 테마로만 초대장을 받아요. 하나도 안 고르면 어떤 테마든 받아요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {view.themes.map((t) => {
            const on = view.interests.includes(t.id);
            return (
              <button key={t.id} type="button" title={t.description} aria-pressed={on} disabled={busy} onClick={() => toggleInterest(t.id)} className={`chip ${on ? "chip-on" : ""}`}>
                {t.emoji} {t.title}
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-center text-sm text-muted">
        정해진 시간에 열리는 <Link href="/themes" className="font-semibold text-brand underline">이벤트 세션</Link>도 있어요.
      </p>

      {invite && (invite.status === "open" || invite.iAccepted) && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-label="초대장">
          <div className="w-full max-w-md overflow-hidden rounded-[2rem] bg-surface shadow-2xl">
            <div className="relative bg-hiro px-6 py-7 text-center text-white">
              <span className="orb -left-6 -top-6 h-20 w-20 opacity-80" aria-hidden />
              <p className="relative text-sm font-semibold text-white/85">💌 AI 초대장</p>
              <p className="relative mt-2 text-4xl">{invite.theme.emoji}</p>
              <h2 className="relative mt-1 text-xl font-extrabold">{invite.theme.title}</h2>
              <p className="relative mt-1 text-sm text-white/90">{invite.theme.description}</p>
            </div>
            <div className="space-y-4 p-6">
              {invite.status === "open" && (
                <div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div className="h-full bg-hiro transition-all" style={{ width: `${(left / ttl) * 100}%` }} />
                  </div>
                  <p className="mt-1 flex justify-between text-xs text-muted">
                    <span>
                      {invite.invited}명 초대 · {invite.accepted}명 수락 (선착순 {view.config.max}명)
                    </span>
                    <span className="font-semibold tabular-nums">{Math.ceil(left / 1000)}초</span>
                  </p>
                </div>
              )}
              <p className="rounded-2xl bg-bg px-3 py-2 text-center text-xs text-muted">
                ⏱️ 예상: {estimateRange(view.config.min, Math.min(view.config.max, invite.invited), view.config.roundSeconds, view.config.breakSeconds).text}
              </p>
              {invite.iAccepted ? (
                <p className="text-center font-semibold">
                  {invite.status === "started"
                    ? invite.iGotIn
                      ? "곧 대화가 시작돼요! 🎧"
                      : "아쉽게도 선착순이 마감됐어요."
                    : `수락했어요! ${view.config.min}명 이상 모이면 바로 시작해요.`}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-ghost" disabled={busy} onClick={() => send("/api/invites/respond", { inviteId: invite.id, accept: false })}>
                    다음에요
                  </button>
                  <button className="btn-primary" disabled={busy} onClick={() => send("/api/invites/respond", { inviteId: invite.id, accept: true })}>
                    수락하기
                  </button>
                </div>
              )}
              <p className="text-center text-xs text-muted">초대받은 분들은 모두 서로의 조건이 맞는 사람들이에요.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
