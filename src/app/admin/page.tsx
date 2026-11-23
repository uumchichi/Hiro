"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtClock, useTick } from "@/components/useHiro";
import type { MatchRun, Theme } from "@/lib/types";

interface Overview {
  now: number;
  config: { ai: boolean; voice: boolean; groupMin: number; groupMax: number };
  counts: { total: number; waiting: number; grouped: number };
  waiting: { id: string; nickname: string; demo: boolean; typeName?: string; tags: string[] }[];
  groups: {
    id: string;
    theme: Theme;
    reason: string;
    status: string;
    members: { id: string; nickname: string; demo: boolean }[];
    roundCount: number;
    roundSeconds: number;
    phase: { kind: string; round?: number; nextRound?: number; endsAt?: number };
    submitted: number;
  }[];
  lastRun: MatchRun | null;
}

const STATUS: Record<string, string> = { ready: "시작 전", live: "진행 중", choosing: "선택 중", done: "종료" };

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [roundMin, setRoundMin] = useState(5);
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

  async function call(url: string, body: unknown, label: string) {
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
    else if (d.run) setMsg(`그룹 ${d.run.groupIds.length}개를 만들었어요 (${d.run.source === "ai" ? "AI" : "규칙 기반"}). 남은 대기자 ${d.run.unmatched.length}명.`);
    load();
  }

  return (
    <div className="space-y-6 pt-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">운영자 화면</h1>
          <p className="text-sm text-muted">대기자 확인 → AI 테마·그룹 매칭 → 로테이션 시작</p>
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
        </div>
      )}

      {msg && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">{msg}</p>}

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">라운지 대기자 {data?.counts.waiting ?? 0}명</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={!!busy} onClick={() => call("/api/admin/seed", { count: 10 }, "seed")}>
              {busy === "seed" ? "추가 중…" : "데모 참가자 10명 추가"}
            </button>
            <button className="btn-primary" disabled={!!busy || !data?.counts.waiting} onClick={() => call("/api/admin/match", {}, "match")}>
              {busy === "match" ? "AI가 테마와 그룹을 고르는 중…" : "🧭 AI 테마 선정 + 그룹 매칭"}
            </button>
          </div>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data?.waiting.map((u) => (
            <li key={u.id} className="rounded-2xl border border-line px-4 py-3 text-sm">
              <b>{u.nickname}</b> {u.demo && <span className="text-xs text-muted">(데모)</span>}
              <span className="ml-1 text-muted">{u.typeName}</span>
              <p className="mt-1 truncate text-xs text-muted">{u.tags.map((t) => `#${t}`).join(" ")}</p>
            </li>
          ))}
        </ul>
      </section>

      {data?.lastRun && (
        <section className="card space-y-3">
          <h2 className="text-lg font-bold">최근 테마 선정 결과</h2>
          <p className="text-sm text-muted">🤖 {data.lastRun.note}</p>
          <div className="flex flex-wrap gap-2">
            {data.lastRun.themes.map((t) => (
              <span key={t.id} className="chip" title={t.description}>
                {t.emoji} {t.title}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">그룹</h2>
          <label className="flex items-center gap-2 text-sm">
            라운드 길이
            <select className="input w-28 py-2" value={roundMin} onChange={(e) => setRoundMin(Number(e.target.value))}>
              {[1, 3, 5, 7, 10].map((m) => (
                <option key={m} value={m}>{m}분</option>
              ))}
            </select>
          </label>
        </div>
        {data?.groups.length === 0 && <p className="text-sm text-muted">아직 그룹이 없어요.</p>}
        {data?.groups.map((g) => {
          const ph = g.phase;
          const left = ph.endsAt ? ph.endsAt - Date.now() : 0;
          return (
            <div key={g.id} className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">
                  {g.theme.emoji} {g.theme.title}
                </h3>
                <span className="chip">{STATUS[g.status] ?? g.status}</span>
              </div>
              <p className="text-sm text-muted">{g.reason}</p>
              <p className="text-sm">{g.members.map((m) => m.nickname + (m.demo ? "*" : "")).join(", ")}</p>
              <p className="text-xs text-muted">
                {g.roundCount}라운드 · 라운드당 {Math.round(g.roundSeconds / 60)}분
                {ph.kind === "talk" && ` · 지금 ${ph.round! + 1}라운드 (${fmtClock(left)} 남음)`}
                {ph.kind === "break" && ` · 쉬는 시간 (${fmtClock(left)})`}
                {g.status === "choosing" && ` · 선택 제출 ${g.submitted}/${g.members.length}`}
              </p>
              {(g.status === "ready" || g.status === "done") && (
                <button className="btn-primary" disabled={!!busy} onClick={() => call("/api/admin/start", { groupId: g.id, roundSeconds: roundMin * 60 }, "start")}>
                  {g.status === "done" ? "다시 시작" : "로테이션 시작 (10초 뒤)"}
                </button>
              )}
            </div>
          );
        })}
      </section>

      <button
        className="btn-ghost text-sm"
        onClick={() => {
          if (confirm("모든 사용자·그룹 데이터를 지울까요?")) call("/api/admin/reset", {}, "reset");
        }}
      >
        데이터 초기화
      </button>
    </div>
  );
}
