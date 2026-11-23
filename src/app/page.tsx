"use client";

import Link from "next/link";
import { nextPath, useHiro } from "@/components/useHiro";

const STEPS = [
  { emoji: "🧪", title: "성향 검사", body: "12문항과 라이프스타일 태그로 나를 알려 주세요. AI가 대화 성향을 분석해 드려요." },
  { emoji: "🧭", title: "AI 테마 매칭", body: "‘고양이 집사’, ‘맵찔이’, ‘교회 다니는 사람’처럼 공감대가 있는 테마로 AI가 그룹을 만들어요." },
  { emoji: "🎧", title: "1:1 음성 로테이션", body: "그룹 안에서 한 명씩 돌아가며 몇 분씩 목소리로 대화해요. 얼굴은 나중에." },
  { emoji: "💞", title: "서로 선택", body: "대화가 끝나면 또 이야기하고 싶은 사람을 고르세요. 서로 고르면 매칭!" },
];

export default function Home() {
  const { state } = useHiro();
  const href = nextPath(state);
  const started = state && state.user.status !== "new";
  return (
    <div className="space-y-10 pt-6">
      <section className="space-y-5">
        <p className="inline-block rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">여성 전용 · 온라인 로테이션 소개팅</p>
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          목소리로 먼저 만나는
          <br />
          <span className="text-brand">취향 맞는 인연</span>, 히로
        </h1>
        <p className="max-w-xl text-lg text-muted">
          성향을 분석하고, 같은 테마를 가진 사람들과 그룹이 되어, 한 명씩 1:1 음성으로 대화해요.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={href} className="btn-primary">
            {started ? "이어서 하기" : "무료로 시작하기"}
          </Link>
          <Link href="/admin" className="btn-ghost">운영자 화면</Link>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-3 flex items-center gap-3">
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-sm font-semibold text-muted">STEP {i + 1}</span>
            </div>
            <h2 className="mb-1 text-lg font-bold">{s.title}</h2>
            <p className="text-[15px] text-muted">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
