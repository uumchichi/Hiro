"use client";

import Link from "next/link";
import { nextPath, useHiro } from "@/components/useHiro";
import { SPECTRUM } from "@/lib/compat";

const STEPS = [
  { emoji: "🧪", title: "성향 검사", body: "12문항과 라이프스타일 태그, 만남 성향으로 나를 알려 주세요. AI가 대화 성향을 분석해 드려요." },
  { emoji: "🧭", title: "AI 테마 매칭", body: "‘고양이 집사’, ‘맵찔이’, ‘교회 다니는 사람’처럼 공감대 있는 테마로, 서로의 조건이 맞는 사람끼리 그룹을 만들어요." },
  { emoji: "🎧", title: "1:1 음성 로테이션", body: "그룹 안에서 한 명씩 돌아가며 몇 분씩 목소리로 대화해요. 얼굴은 나중에." },
  { emoji: "💞", title: "서로 선택", body: "대화가 끝나면 또 이야기하고 싶은 사람을 고르세요. 서로 고르면 매칭!" },
];

const LEGEND = [
  { label: "플라토닉", color: SPECTRUM.platonic },
  { label: "온텍", color: SPECTRUM.tek },
  { label: "중간", color: SPECTRUM.mid },
  { label: "온깁", color: SPECTRUM.gib },
];

export default function Home() {
  const { state } = useHiro();
  const href = nextPath(state);
  const started = state && state.user.status !== "new";
  return (
    <div className="space-y-10 pt-2">
      <section className="relative overflow-hidden rounded-[2rem] bg-hiro px-6 py-12 text-white sm:px-10 sm:py-16">
        <span className="orb -right-10 -top-10 h-44 w-44 opacity-90 sm:h-56 sm:w-56" aria-hidden />
        <span className="orb bottom-6 right-24 hidden h-16 w-16 sm:block" style={{ background: `radial-gradient(circle at 30% 30%, #fff, ${SPECTRUM.platonic} 45%, ${SPECTRUM.tek})` }} aria-hidden />
        <span className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full border-[22px] border-white/25" aria-hidden />
        <div className="relative max-w-xl space-y-5">
          <p className="inline-block rounded-full bg-white/20 px-3 py-1 text-sm font-semibold backdrop-blur">여성 전용 · 온라인 로테이션 소개팅</p>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            목소리로 먼저 만나는
            <br />
            취향 맞는 인연, 히로
          </h1>
          <p className="text-lg text-white/90">성향을 분석하고, 같은 테마를 가진 사람들과 그룹이 되어, 한 명씩 1:1 음성으로 대화해요.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={href} className="btn bg-white text-[#6b2fd6] shadow-lg hover:brightness-95">
              {started ? "이어서 하기" : "무료로 시작하기"}
            </Link>
            <Link href="/admin" className="btn border border-white/50 text-white hover:bg-white/10">운영자 화면</Link>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-bold">히로 스펙트럼</h2>
          <p className="text-sm text-muted">텍깁 성향은 색으로 보여요. 같은 그룹 사람들의 배지 색으로 서로의 성향을 한눈에 알 수 있어요.</p>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="w-[14%]" style={{ background: SPECTRUM.platonic }} />
          <div className="ml-1 flex-1 rounded-l-full" style={{ background: `linear-gradient(90deg, ${SPECTRUM.tek}, ${SPECTRUM.mid}, ${SPECTRUM.gib})` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <div key={s.title} className="card">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-soft text-xl">{s.emoji}</span>
              <span className="text-hiro text-sm font-extrabold">STEP {i + 1}</span>
            </div>
            <h2 className="mb-1 text-lg font-bold">{s.title}</h2>
            <p className="text-[15px] text-muted">{s.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
