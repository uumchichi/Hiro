"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TraitBars } from "@/components/TraitBars";
import { useHiro } from "@/components/useHiro";
import { PARTNER_QUESTIONS } from "@/lib/questions";

export default function MePage() {
  const router = useRouter();
  const { state, error } = useHiro();

  useEffect(() => {
    if (state && !state.user.profile) router.replace("/start");
    else if (state && !state.user.analysis) router.replace("/quiz");
  }, [state, router]);

  const a = state?.user.analysis;
  if (!state || !a) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;

  return (
    <div className="space-y-5 pt-4">
      <div className="card text-center">
        <div className="text-5xl">{a.emoji}</div>
        <p className="mt-3 text-sm font-semibold text-muted">{state.user.profile?.nickname}님의 대화 성향</p>
        <h1 className="mt-1 text-hiro text-3xl font-extrabold">{a.typeName}</h1>
        <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed">{a.summary}</p>
        {a.source === "rule" && <p className="mt-3 text-xs text-muted">※ AI 키가 없어 기본 분석으로 보여 드려요.</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 font-bold">성향 지도</h2>
          <TraitBars traits={a.traits} />
        </div>
        <div className="card space-y-4">
          <div>
            <h2 className="mb-2 font-bold">나의 강점</h2>
            <ul className="flex flex-wrap gap-2">
              {a.strengths.map((s) => (
                <li key={s} className="chip chip-on">{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-bold">대화 팁</h2>
            <ul className="list-disc space-y-1 pl-5 text-[15px]">
              {a.conversationTips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-1 font-bold">잘 맞는 사람</h2>
            <p className="text-[15px]">{a.idealMatch}</p>
          </div>
          {state.user.partnerWants && (
            <div>
              <h2 className="mb-2 font-bold">내가 원하는 상대</h2>
              <ul className="flex flex-wrap gap-2">
                {PARTNER_QUESTIONS.filter((q) => state.user.partnerWants![q.trait] !== "any").map((q) => (
                  <li key={q.trait} className="chip">
                    {state.user.partnerWants![q.trait] === "high" ? q.high : q.low}
                  </li>
                ))}
                {PARTNER_QUESTIONS.every((q) => state.user.partnerWants![q.trait] === "any") && <li className="chip">누구든 좋아요</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <Link href={state.user.status === "grouped" ? "/room" : "/lobby"} className="btn-primary">
          {state.user.status === "grouped" ? "대화방으로 가기" : "대기실 입장하기"}
        </Link>
        <Link href="/quiz" className="btn-ghost">검사 다시 하기</Link>
        <Link href="/start" className="btn-ghost">프로필 수정</Link>
      </div>
    </div>
  );
}
