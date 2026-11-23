"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro } from "@/components/useHiro";
import { LIKERT, PARTNER_QUESTIONS, QUESTIONS } from "@/lib/questions";
import type { PartnerWants, Want } from "@/lib/types";
import { DEFAULT_HABITS, DEFAULT_PREFS, PIERCING, SMOKE, TATTOO, type MatchPrefs, type MatchTraits } from "@/lib/compat";

type Habits = Pick<MatchTraits, "smoke" | "tattoo" | "piercing">;
type Allow = Pick<MatchPrefs, "smokeMax" | "tattooMax" | "piercingMax">;

const HABIT_ROWS = [
  { key: "smoke", maxKey: "smokeMax", title: "🚬 담배", list: SMOKE },
  { key: "tattoo", maxKey: "tattooMax", title: "🖋️ 문신", list: TATTOO },
  { key: "piercing", maxKey: "piercingMax", title: "💎 피어싱", list: PIERCING },
] as const;

function Choice({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`rounded-2xl border px-3 py-2.5 text-left text-sm leading-snug transition ${on ? "border-brand bg-brand text-brand-ink font-semibold" : "border-line hover:bg-brand-soft"}`}
    >
      {label}
    </button>
  );
}

const ANY_WANTS: PartnerWants = { energy: "any", empathy: "any", planning: "any", openness: "any", expression: "any" };

export default function QuizPage() {
  const router = useRouter();
  const { state, post, error } = useHiro();
  const [answers, setAnswers] = useState<(number | null)[]>(QUESTIONS.map(() => null));
  const [wants, setWants] = useState<PartnerWants>(ANY_WANTS);
  const [habits, setHabits] = useState<Habits>(DEFAULT_HABITS);
  const [allow, setAllow] = useState<Allow>({ smokeMax: DEFAULT_PREFS.smokeMax, tattooMax: DEFAULT_PREFS.tattooMax, piercingMax: DEFAULT_PREFS.piercingMax });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state && !state.user.profile) router.replace("/start");
  }, [state, router]);

  useEffect(() => {
    if (state?.user.partnerWants) setWants(state.user.partnerWants);
    const t = state?.user.matchTraits;
    if (t) setHabits({ smoke: t.smoke, tattoo: t.tattoo, piercing: t.piercing });
    const p = state?.user.prefs;
    if (p) setAllow({ smokeMax: p.smokeMax, tattooMax: p.tattooMax, piercingMax: p.piercingMax });
  }, [state?.user.partnerWants, state?.user.matchTraits, state?.user.prefs]);

  const done = answers.filter((a) => a !== null).length;

  async function submit() {
    setBusy(true);
    const ok = await post("/api/quiz", { answers, partnerWants: wants, habits, allow });
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
        <h2 className="text-xl font-extrabold">생활 습관 (문담피)</h2>
        <p className="mt-1 text-muted">
          내가 하는 것과 상대가 해도 괜찮은 건 다를 수 있어요. 둘 다 골라 주세요. ‘상대는 어디까지’는 <b>필수 조건</b>이라, 서로 괜찮은 사람끼리만 같은 그룹이 돼요.
        </p>
      </div>
      <div className="space-y-4">
        {HABIT_ROWS.map((row) => (
          <div key={row.key} className="card space-y-4">
            <p className="text-lg font-bold">{row.title}</p>
            <div>
              <p className="label">나는?</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`${row.title} 나는`}>
                {row.list.map((o) => (
                  <Choice key={o.v} label={o.me} on={habits[row.key] === o.v} onClick={() => setHabits({ ...habits, [row.key]: o.v })} />
                ))}
              </div>
            </div>
            <div>
              <p className="label">상대는 어디까지 괜찮아요?</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`${row.title} 상대`}>
                {row.list.map((o) => (
                  <Choice key={o.v} label={o.allow} on={allow[row.maxKey] === o.v} onClick={() => setAllow({ ...allow, [row.maxKey]: o.v })} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

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
