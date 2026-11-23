"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtClock, useTick } from "@/components/useHiro";
import { fmtUntil, fmtWhen } from "@/components/useSlots";
import { fmtSlotTime } from "@/lib/schedule";
import type { Theme } from "@/lib/types";

interface Overview {
  now: number;
  config: { ai: boolean; voice: boolean; groupMin: number; groupMax: number };
  counts: { total: number; real: number; demo: number; grouped: number };
  catalog: { source: "ai" | "rule"; note: string; createdAt: number; count: number } | null;
  slots: {
    id: string;
    theme: Theme;
    startsAt: number;
    status: string;
    applicants: { id: string; nickname: string; demo: boolean; present: boolean }[];
    note: string | null;
  }[];
  groups: {
    id: string;
    theme: Theme;
    status: string;
    members: { id: string; nickname: string; demo: boolean }[];
    roundCount: number;
    roundSeconds: number;
    phase: { kind: string; round?: number; nextRound?: number; endsAt?: number };
    submitted: number;
  }[];
  lobby: { id: string; nickname: string; demo: boolean; online: boolean; priority: number; waitedSec: number; interests: number }[];
  invites: {
    id: string;
    kind: "now" | "scheduled";
    startsAt: number | null;
    theme: Theme;
    status: string;
    source: "ai" | "rule";
    expiresAt: number;
    invitees: { nickname: string; state: "accepted" | "declined" | "pending" }[];
  }[];
}

const INVITE_STATUS: Record<string, string> = { open: "응답 받는 중", started: "시작됨", confirmed: "예약 확정", expired: "무산" };

const SLOT_STATUS: Record<string, string> = { open: "모집 중", forming: "그룹 나누는 중", started: "진행됨", cancelled: "취소됨" };
const GROUP_STATUS: Record<string, string> = { ready: "시작 전", live: "대화 중", choosing: "선택 중", done: "종료" };

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [testRound, setTestRound] = useState(60);
  useTick();

  useEffect(() => {
    try {
      setKey(localStorage.getItem("hiro_admin_key") ?? "");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { headers: { "x-admin-key": key }, cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      setMsg(d.error);
      setData(null);
    } else setData(d);
  }, [key]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function call(url: string, body: unknown, label: string, done?: string) {
    setBusy(label);
    setMsg(null);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": key },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) setMsg(d.error ?? "실패했어요.");
    else if (d.note) setMsg(`🤖 ${d.note}`);
    else if (done) setMsg(done);
    load();
  }

  const now = data?.now ?? Date.now();
  const upcoming = data?.slots.filter((s) => s.status === "open" || s.status === "forming") ?? [];
  const finished = data?.slots.filter((s) => s.status === "started" || s.status === "cancelled") ?? [];

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">운영자 화면</h1>
          <p className="text-sm text-muted">테마 게시판은 늘 열려 있고, 세션은 시작 시간에 자동으로 그룹이 돼요.</p>
        </div>
        <input
          className="input max-w-56"
          placeholder="운영자 키 (설정한 경우)"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            try {
              localStorage.setItem("hiro_admin_key", e.target.value);
            } catch {}
          }}
        />
      </div>

      {data && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className={`chip ${data.config.ai ? "chip-on" : ""}`}>AI(Claude) {data.config.ai ? "연결됨" : "미설정 → 규칙 기반"}</span>
          <span className={`chip ${data.config.voice ? "chip-on" : ""}`}>음성(LiveKit) {data.config.voice ? "연결됨" : "미설정"}</span>
          <span className="chip">그룹 {data.config.groupMin}~{data.config.groupMax}명</span>
          <span className="chip">사용자 {data.counts.real}명 · 데모 {data.counts.demo}명</span>
        </div>
      )}

      {msg && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">{msg}</p>}

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">대기실 · AI 초대장</h2>
        <p className="text-sm text-muted">
          데모 참가자를 대기실에 넣고 내 계정으로 대기실 화면을 열어 두세요. 바로 시작 초대장은 서로 맞는 사람이 모이면 자동으로 나가요(8명이 모이거나 20초 이상 기다리면). 예약 초대장은 30초마다 선호 시간대가 겹치는 사람을 찾아요. 데모는 몇 초~수십 초 안에 응답해요.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!!busy} onClick={() => call("/api/admin/lobby", { action: "seed", count: 6 }, "lobbySeed", "데모 참가자 6명을 대기실에 넣었어요.")}>
            데모 6명 대기실에 넣기
          </button>
          <button className="btn-primary" disabled={!!busy} onClick={() => call("/api/admin/lobby", { action: "invite", kind: "now" }, "inviteNow", "바로 시작 초대장을 만들었어요 (만들 수 있는 경우).")}>
            ⚡ 바로 시작 초대장 지금 보내기
          </button>
          <button className="btn-primary" disabled={!!busy} onClick={() => call("/api/admin/lobby", { action: "invite", kind: "scheduled" }, "inviteSched", "예약 초대장을 만들었어요 (만들 수 있는 경우).")}>
            📅 예약 초대장 지금 보내기
          </button>
        </div>
        {data && (
          <p className="text-sm">
            대기실 {data.lobby.filter((l) => l.online).length}명 접속 중:{" "}
            <span className="text-muted">
              {data.lobby
                .filter((l) => l.online)
                .map((l) => `${l.nickname}${l.demo ? "*" : ""}${l.priority ? ` ⭐${l.priority}` : ""}`)
                .join(", ") || "없음"}
            </span>
          </p>
        )}
        {data?.invites.map((inv) => (
          <div key={inv.id} className="rounded-2xl border border-line p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">
                {inv.kind === "now" ? "⚡" : "📅"} {inv.theme.emoji} {inv.theme.title}
                {inv.startsAt && <span className="ml-1 font-normal text-muted">· {fmtSlotTime(inv.startsAt, now)}</span>}
              </p>
              <span className="chip">
                {INVITE_STATUS[inv.status] ?? inv.status}
                {inv.status === "open" && ` · ${fmtUntil(inv.expiresAt - now)}`}
              </span>
            </div>
            <p className="mt-1 text-muted">
              {inv.source === "ai" ? "AI" : "규칙"} ·{" "}
              {inv.invitees.map((p) => `${p.nickname}${p.state === "accepted" ? " ✅" : p.state === "declined" ? " ✖" : " …"}`).join(", ")}
            </p>
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-bold">이벤트 세션 테스트</h2>
        <p className="text-sm text-muted">
          데모 참가자를 만든 뒤 곧 시작하는 테스트 세션을 열어 보세요. 내 계정으로 그 세션을 신청하고 대기실에 들어가 있으면, 시작 시간에 데모 참가자들과 그룹이 돼요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" disabled={!!busy} onClick={() => call("/api/admin/seed", { count: 10 }, "seed", "데모 참가자 10명을 만들고 세션에 신청시켰어요.")}>
            {busy === "seed" ? "추가 중…" : "데모 참가자 10명 추가"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            라운드
            <select className="input w-24 py-2" value={testRound} onChange={(e) => setTestRound(Number(e.target.value))}>
              {[30, 60, 180, 300].map((s) => (
                <option key={s} value={s}>{s < 60 ? `${s}초` : `${s / 60}분`}</option>
              ))}
            </select>
          </label>
          <button
            className="btn-primary"
            disabled={!!busy}
            onClick={() => call("/api/admin/slot", { action: "create", minutes: 2, roundSeconds: testRound, demo: true }, "slot", "2분 뒤 시작하는 테스트 세션을 만들었어요. 데모 참가자 전원이 신청했어요.")}
          >
            2분 뒤 시작하는 테스트 세션 열기
          </button>
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">테마 목록</h2>
          <button className="btn-primary" disabled={!!busy} onClick={() => call("/api/admin/catalog", {}, "catalog")}>
            {busy === "catalog" ? "AI가 테마를 고르는 중…" : "🧭 AI로 테마 새로 만들기"}
          </button>
        </div>
        <p className="text-sm text-muted">
          {data?.catalog
            ? `${data.catalog.source === "ai" ? "AI" : "기본"} 테마 ${data.catalog.count}개 · ${data.catalog.note}`
            : "기본 테마 목록을 쓰고 있어요. AI로 새로 만들면 이용자들의 태그 분포를 보고 테마를 정해요."}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">예정된 세션 {upcoming.length}개</h2>
        {upcoming.map((s) => (
          <div key={s.id} className="card space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">
                {s.theme.emoji} {s.theme.title}
              </h3>
              <span className="chip">{SLOT_STATUS[s.status] ?? s.status}</span>
            </div>
            <p className="text-sm text-muted">
              {fmtWhen(s.startsAt, now)} ({fmtUntil(s.startsAt - now)}) · 신청 {s.applicants.length}명 · 대기실 {s.applicants.filter((a) => a.present).length}명
            </p>
            {s.applicants.length > 0 && (
              <p className="text-sm">
                {s.applicants.map((a) => `${a.nickname}${a.demo ? "*" : ""}${a.present ? " 🟢" : ""}`).join(", ")}
              </p>
            )}
            {s.status === "open" && (
              <button className="btn-ghost text-sm" disabled={!!busy} onClick={() => call("/api/admin/slot", { action: "startNow", slotId: s.id }, "now", "세션을 지금 시작했어요.")}>
                지금 바로 시작
              </button>
            )}
          </div>
        ))}
      </section>

      {data && data.groups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">그룹</h2>
          {data.groups.map((g) => {
            const ph = g.phase;
            const left = ph.endsAt ? ph.endsAt - Date.now() : 0;
            return (
              <div key={g.id} className="card space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">
                    {g.theme.emoji} {g.theme.title}
                  </h3>
                  <span className="chip">{GROUP_STATUS[g.status] ?? g.status}</span>
                </div>
                <p className="text-sm">{g.members.map((m) => m.nickname + (m.demo ? "*" : "")).join(", ")}</p>
                <p className="text-xs text-muted">
                  {g.roundCount}라운드 · 라운드당 {g.roundSeconds < 60 ? `${g.roundSeconds}초` : `${Math.round(g.roundSeconds / 60)}분`}
                  {ph.kind === "talk" && ` · 지금 ${ph.round! + 1}라운드 (${fmtClock(left)} 남음)`}
                  {ph.kind === "break" && ` · 쉬는 시간 (${fmtClock(left)})`}
                  {g.status === "choosing" && ` · 선택 제출 ${g.submitted}/${g.members.length}`}
                </p>
              </div>
            );
          })}
        </section>
      )}

      {finished.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">지난 세션</h2>
          {finished.map((s) => (
            <p key={s.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              {s.theme.emoji} {s.theme.title} · {SLOT_STATUS[s.status]} · <span className="text-muted">{s.note}</span>
            </p>
          ))}
        </section>
      )}

      <button
        className="btn-ghost text-sm"
        onClick={() => {
          if (confirm("모든 사용자·세션·그룹 데이터를 지울까요?")) call("/api/admin/reset", {}, "reset", "초기화했어요.");
        }}
      >
        데이터 초기화
      </button>
    </div>
  );
}
