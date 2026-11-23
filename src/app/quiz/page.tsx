"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro } from "@/components/useHiro";
import { LIKERT, PARTNER_QUESTIONS, QUESTIONS } from "@/lib/questions";
import type { PartnerWants, Want } from "@/lib/types";

const ANY_WANTS: PartnerWants = { energy: "any", empathy: "any", planning: "any", openness: "any", expression: "any" };

export default function QuizPage() {
  const router = useRouter();
  const { state, post, error } = useHiro();
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [wants, setWants] = useState<PartnerWants>(ANY_WANTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state && !state.user.profile) router.replace("/start");
  }, [state, router]);

  useEffect(() => {
    if (state?.user.partnerWants) setWants(state.user.partnerWants);
  }, [state?.user.partnerWants]);

  const done = answers.filter((a) => a !== null).length;

  async function submit() {
    setBusy(true);
    const ok = await post("/api/quiz", { answers, partnerWants: wants });
    setBusy(false);
    if (ok) router.push("/me");
  }

  return (
    <div className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">성향 검사</h1>
        <p className="mt-1 text-muted">정답은 없어요. 평소의 나에 가까운 쪽을 골라 주세요.</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-hiro transition-all" style={{ width: `${(done / QUESTIONS.length) * 100}%` }} />
        </div>
        <p className="mt-1 text-right text-sm text-muted">{done} / {QUESTIONS.length}</p>
      </div>

      <ol className="space-y-4">
        {QUESTIONS.map((q, i) => (
          <li key={q.id} className="card">
            <p className="mb-4 font-semibold">
              <span className="mr-2 text-brand">Q{i + 1}.</span>
              {q.text}
            </p>
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="radiogroup" aria-label={q.text}>
              {LIKERT.map((label, v) => {
                const on = answers[i] === v + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAnswers((cur) => cur.map((a, j) => (j === i ? v + 1 : a)))}
                    className={`rounded-2xl border px-1 py-2.5 text-xs leading-tight transition sm:text-sm ${on ? "border-brand bg-brand text-brand-ink font-semibold" : "border-line hover:bg-brand-soft"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      <div className="pt-4">
        <h2 className="text-xl font-extrabold">어떤 사람을 만나고 싶어요?</h2>
        <p className="mt-1 text-muted">
          나와 비슷한 사람이 좋을 수도, 나와 반대인 사람이 좋을 수도 있어요. 원하는 쪽을 골라 주시면 서로 잘 맞는 사람끼리 같은 그룹이 되도록 할게요.
        </p>
      </div>
      <ol className="space-y-4">
        {PARTNER_QUESTIONS.map((q) => (
          <li key={q.trait} className="card">
            <p className="mb-4 font-semibold">{q.text}</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={q.text}>
              {(
                [
                  ["low", q.low],
                  ["any", "상관없어요"],
                  ["high", q.high],
                ] as [Want, string][]
              ).map(([v, label]) => {
                const on = wants[q.trait] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setWants({ ...wants, [q.trait]: v })}
                    className={`rounded-2xl border px-2 py-3 text-xs leading-snug transition sm:text-sm ${on ? "border-brand bg-brand text-brand-ink font-semibold" : "border-line hover:bg-brand-soft"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>

      {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      <button className="btn-primary w-full" disabled={busy || done < QUESTIONS.length} onClick={submit}>
        {busy ? "AI가 성향을 분석하고 있어요…" : "결과 보기"}
      </button>
    </div>
  );
}
