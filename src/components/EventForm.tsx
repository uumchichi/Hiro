"use client";

import { useState } from "react";
import { estimateRange } from "@/lib/estimate";
import { TAG_GROUPS } from "@/lib/questions";

/** 운영진이 테마를 기획해 특정 날짜·시간에 여는 이벤트 */
export function EventForm({
  adminKey,
  groupMin,
  groupMax,
  breakSeconds,
  onDone,
}: {
  adminKey: string;
  groupMin: number;
  groupMax: number;
  breakSeconds: number;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [emoji, setEmoji] = useState("✨");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [icebreakers, setIcebreakers] = useState("");
  const [when, setWhen] = useState("");
  const [roundMinutes, setRoundMinutes] = useState(5);
  const [capacity, setCapacity] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const est = estimateRange(groupMin, groupMax, roundMinutes * 60, breakSeconds);
  const groups = Math.floor(capacity / groupMin) ? `${Math.ceil(capacity / groupMax)}~${Math.floor(capacity / groupMin)}개 그룹으로 나뉘어 동시에 진행돼요` : "";

  async function submit() {
    setErr(null);
    const startsAt = when ? new Date(when).getTime() : NaN; // 운영자 브라우저의 현지 시각
    if (!title.trim() || Number.isNaN(startsAt)) {
      setErr("테마 이름과 날짜·시간을 입력해 주세요.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-key": adminKey },
      body: JSON.stringify({
        action: "create",
        title,
        emoji,
        description,
        tags,
        icebreakers: icebreakers.split("\n").map((l) => l.trim()).filter(Boolean),
        startsAt,
        roundMinutes,
        capacity,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "만들지 못했어요.");
      return;
    }
    setTitle("");
    setDescription("");
    setTags([]);
    setIcebreakers("");
    onDone(`'${title}' 이벤트를 열었어요.`);
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">✨ 운영진 기획 이벤트 만들기</h2>
        <p className="text-sm text-muted">테마를 직접 기획하고 날짜·시간을 정해 열어요. 이벤트 페이지 맨 위에 ‘운영진 기획’으로 보여요.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
        <label>
          <span className="label">이모지</span>
          <input className="input text-center" maxLength={4} value={emoji} onChange={(e) => setEmoji(e.target.value)} />
        </label>
        <label>
          <span className="label">테마 이름</span>
          <input className="input" maxLength={40} placeholder="예: 크리스마스 이브, 혼자가 아닌 밤" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="label">한 줄 설명</span>
        <input className="input" maxLength={120} placeholder="예: 연말을 함께 보낼 사람을 찾는 특별한 밤" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div>
        <span className="label">관련 태그 (선택, 최대 6개)</span>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {TAG_GROUPS.flatMap((g) => g.tags).map((t) => {
            const on = tags.includes(t);
            return (
              <button key={t} type="button" aria-pressed={on} className={`chip py-1 text-xs ${on ? "chip-on" : ""}`} onClick={() => setTags(on ? tags.filter((x) => x !== t) : tags.length < 6 ? [...tags, t] : tags)}>
                {t}
              </button>
            );
          })}
        </div>
      </div>
      <label className="block">
        <span className="label">대화 주제 (선택, 한 줄에 하나씩, 최대 5개)</span>
        <textarea className="input min-h-20 text-sm" placeholder={"올해 가장 기억에 남는 순간은?\n연말에 꼭 하고 싶은 일은?"} value={icebreakers} onChange={(e) => setIcebreakers(e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">날짜·시간</span>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <label>
          <span className="label">라운드 길이</span>
          <select className="input" value={roundMinutes} onChange={(e) => setRoundMinutes(Number(e.target.value))}>
            {[3, 5, 7, 10].map((m) => (
              <option key={m} value={m}>{m}분</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">정원</span>
          <input type="number" className="input" min={4} max={60} value={capacity} onChange={(e) => setCapacity(Math.max(4, Math.min(60, Number(e.target.value) || 4)))} />
        </label>
      </div>
      <p className="rounded-2xl bg-bg px-4 py-3 text-sm">
        ⏱️ 그룹별 예상: <b>{est.text}</b>
        {groups && <span className="block text-xs text-muted">정원 {capacity}명이 모두 오면 {groups}.</span>}
      </p>
      {err && <p className="text-sm font-semibold text-brand">{err}</p>}
      <button className="btn-primary" disabled={busy} onClick={submit}>
        {busy ? "여는 중…" : "이벤트 열기"}
      </button>
    </section>
  );
}
