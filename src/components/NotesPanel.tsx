"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicMember } from "@/lib/server";
import { apiFetch } from "@/lib/api";

type Entry = { member: PublicMember; letter: string; memo: string };
type Draft = { letter: string; memo: string; saved: "idle" | "saving" | "saved" | "error" };

/**
 * 대화한 사람마다 쪽지(상대에게, 끝난 뒤 익명 전달)와 메모(나만 보기)를 씁니다.
 * 입력을 멈추면 자동으로 저장돼요.
 */
export function NotesPanel({ groupId, met, focusId }: { groupId: string; met: Entry[]; focusId: string | null }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [open, setOpen] = useState<string | null>(focusId);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 서버 값은 처음 한 번만 가져와요 (입력 중인 내용을 덮어쓰지 않도록)
  useEffect(() => {
    setDrafts((cur) => {
      const next = { ...cur };
      for (const e of met) if (!next[e.member.id]) next[e.member.id] = { letter: e.letter, memo: e.memo, saved: "idle" };
      return next;
    });
  }, [met]);

  useEffect(() => {
    if (focusId) setOpen(focusId);
  }, [focusId]);

  function change(id: string, field: "letter" | "memo", value: string) {
    setDrafts((cur) => ({ ...cur, [id]: { ...cur[id], [field]: value, saved: "saving" } }));
    clearTimeout(timers.current[id + field]);
    timers.current[id + field] = setTimeout(async () => {
      const res = await apiFetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, to: id, [field]: value }),
      }).catch(() => null);
      setDrafts((cur) => ({ ...cur, [id]: { ...cur[id], saved: res?.ok ? "saved" : "error" } }));
    }, 700);
  }

  if (!met.length) return null;
  const ordered = [...met].reverse(); // 가장 최근에 만난 사람부터

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="text-lg font-bold">💌 쪽지 · 📝 메모</h2>
        <p className="text-sm text-muted">
          쪽지는 로테이션이 모두 끝난 뒤 <b>익명으로</b> 전달돼요. 메모는 나만 볼 수 있어요.
        </p>
      </div>
      {ordered.map(({ member }) => {
        const d = drafts[member.id] ?? { letter: "", memo: "", saved: "idle" };
        const isOpen = open === member.id;
        return (
          <div key={member.id} className={`rounded-2xl border ${isOpen ? "border-brand" : "border-line"}`}>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen(isOpen ? null : member.id)} aria-expanded={isOpen}>
              <span className="flex items-center gap-2 font-semibold">
                <span className="text-lg">{member.emoji}</span>
                {member.nickname}
                {member.id === focusId && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">지금 대화 중</span>}
              </span>
              <span className="text-xs text-muted">
                {d.letter ? "💌 " : ""}
                {d.memo ? "📝 " : ""}
                {isOpen ? "접기" : "쓰기"}
              </span>
            </button>
            {isOpen && (
              <div className="space-y-3 px-4 pb-4">
                <label className="block">
                  <span className="mb-1 flex justify-between text-sm font-semibold">
                    <span>💌 쪽지 (애프터 신청)</span>
                    <span className="font-normal text-muted">{d.letter.length}/300</span>
                  </span>
                  <textarea
                    className="input min-h-20 text-sm"
                    maxLength={300}
                    value={d.letter}
                    placeholder="예: 목소리가 편안했어요. 다음에 또 이야기 나누고 싶어요!"
                    onChange={(e) => change(member.id, "letter", e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex justify-between text-sm font-semibold">
                    <span>📝 메모 (나만 보기)</span>
                    <span className="font-normal text-muted">{d.memo.length}/500</span>
                  </span>
                  <textarea
                    className="input min-h-20 text-sm"
                    maxLength={500}
                    value={d.memo}
                    placeholder="예: 고양이 2마리, 주말 러닝, 말투가 차분함"
                    onChange={(e) => change(member.id, "memo", e.target.value)}
                  />
                </label>
                <p className="text-right text-xs text-muted">
                  {d.saved === "saving" ? "저장 중…" : d.saved === "saved" ? "저장됐어요" : d.saved === "error" ? "저장하지 못했어요. 다시 입력해 주세요." : ""}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
