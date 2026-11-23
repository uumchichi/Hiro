"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MemberCard } from "@/components/MemberCard";
import { fmtClock, useHiro, useTick } from "@/components/useHiro";

const VoiceRoom = dynamic(() => import("@/components/VoiceRoom"), { ssr: false });

export default function RoomPage() {
  const router = useRouter();
  const { state, post, error, serverNow } = useHiro(2000);
  const [picks, setPicks] = useState<string[]>([]);
  useTick();

  const group = state?.group;
  useEffect(() => {
    if (state && (!group || group.status === "ready")) router.replace("/lobby");
  }, [state, group, router]);
  useEffect(() => {
    if (group?.myChoices) setPicks(group.myChoices);
  }, [group?.myChoices]);

  if (!state || !group) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const me = state.user.id;
  const others = group.members.filter((m) => m.id !== me);
  const phase = group.phase;
  const now = serverNow();

  // ── 선택 & 결과 ──
  if (group.status === "choosing" || group.status === "done" || phase.kind === "finished") {
    if (group.submitted) {
      return (
        <div className="space-y-5 pt-4">
          <div className="card text-center">
            <p className="text-4xl">💞</p>
            <h1 className="mt-2 text-2xl font-extrabold">매칭 결과</h1>
            {group.waitingFor > 0 && <p className="mt-1 text-muted">아직 {group.waitingFor}명이 고르는 중이에요. 결과가 계속 업데이트돼요.</p>}
          </div>
          {group.mutual.length > 0 ? (
            <div className="space-y-3">
              <p className="font-bold">서로 선택한 사람 🎉</p>
              {group.mutual.map((m) => (
                <MemberCard key={m.id} m={m} highlight>
                  <p className="mt-3 text-sm">{m.bio}</p>
                </MemberCard>
              ))}
              <p className="text-sm text-muted">정식 서비스에서는 여기서 1:1 채팅방이 열릴 예정이에요.</p>
            </div>
          ) : (
            <div className="card text-center text-muted">
              {group.waitingFor > 0 ? "다른 분들의 선택을 기다리고 있어요." : "이번엔 서로 선택한 분이 없어요. 다음 테마에서 또 만나요!"}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={async () => {
                if (await post("/api/rejoin")) router.push("/me");
              }}
            >
              새 그룹 매칭 받기
            </button>
            <Link href="/me" className="btn-ghost">내 성향 보기</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-5 pt-4">
        <div>
          <h1 className="text-2xl font-extrabold">대화 즐거우셨나요?</h1>
          <p className="mt-1 text-muted">또 이야기하고 싶은 사람을 모두 골라 주세요. 서로 고른 경우에만 알려 드려요.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((m) => {
            const on = picks.includes(m.id);
            return (
              <button key={m.id} className="text-left" onClick={() => setPicks((c) => (on ? c.filter((x) => x !== m.id) : [...c, m.id]))} aria-pressed={on}>
                <MemberCard m={m} highlight={on}>
                  <p className="mt-3 text-sm font-semibold text-brand">{on ? "💗 또 이야기하고 싶어요" : "선택하기"}</p>
                </MemberCard>
              </button>
            );
          })}
        </div>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
        <button className="btn-primary w-full" onClick={() => post("/api/choices", { ids: picks })}>
          {picks.length ? `${picks.length}명 선택 완료` : "아무도 선택하지 않고 마치기"}
        </button>
      </div>
    );
  }

  // ── 시작 전 카운트다운 ──
  if (phase.kind === "not_started") {
    const left = group.startedAt ? group.startedAt - now : 0;
    return (
      <div className="card mt-6 text-center">
        <p className="text-sm font-semibold text-brand">{group.theme.emoji} {group.theme.title}</p>
        <p className="mt-4 text-6xl font-extrabold tabular-nums">{fmtClock(left)}</p>
        <p className="mt-3 text-muted">곧 첫 번째 대화가 시작돼요. 조용한 곳에서 이어폰을 준비해 주세요.</p>
      </div>
    );
  }

  const roundNo = phase.kind === "talk" ? phase.round + 1 : phase.nextRound + 1;
  const left = phase.endsAt - now;
  const partner = group.partner;

  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-muted">
          {group.theme.emoji} {group.theme.title}
        </p>
        <p className="text-sm font-semibold">
          라운드 {roundNo} / {group.roundCount}
        </p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-brand" style={{ width: `${((roundNo - (phase.kind === "talk" ? 1 : 0)) / group.roundCount) * 100}%` }} />
      </div>

      {phase.kind === "break" ? (
        <div className="card text-center">
          <p className="text-muted">잠깐 쉬어요 ☕ 다음 대화까지</p>
          <p className="mt-2 text-5xl font-extrabold tabular-nums">{fmtClock(left)}</p>
          {partner ? (
            <p className="mt-3">
              다음 상대는 <b>{partner.nickname}</b>님이에요.
            </p>
          ) : (
            <p className="mt-3 text-muted">다음 라운드는 쉬는 차례예요.</p>
          )}
        </div>
      ) : partner ? (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">지금 대화 상대</p>
              <p className={`text-2xl font-extrabold tabular-nums ${left < 30_000 ? "text-brand" : ""}`}>{fmtClock(left)}</p>
            </div>
            <MemberCard m={partner}>{partner.bio && <p className="mt-3 text-sm">“{partner.bio}”</p>}</MemberCard>
            {state.voice.configured ? (
              partner.id.startsWith("demo_") ? (
                <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm">데모 참가자는 음성에 들어오지 않아요. 실제 사용자끼리 매칭되면 여기서 음성 대화가 연결돼요.</p>
              ) : (
                group.room && <VoiceRoom room={group.room} partnerName={partner.nickname} />
              )
            ) : (
              <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm">
                음성 서버(LiveKit)가 아직 설정되지 않아 화면 흐름만 진행돼요. <code>.env.local</code>에 LiveKit 키를 넣으면 실제 음성 대화가 연결돼요.
              </p>
            )}
          </div>
          <div className="card">
            <p className="mb-3 font-bold">🤖 AI 추천 대화 주제</p>
            <ul className="space-y-2">
              {group.icebreakers.map((q) => (
                <li key={q} className="rounded-2xl bg-bg px-4 py-3 text-[15px]">{q}</li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="card text-center">
          <p className="text-4xl">🌿</p>
          <p className="mt-2 font-bold">이번 라운드는 쉬는 차례예요</p>
          <p className="mt-1 text-muted">인원이 홀수라 한 분씩 돌아가며 쉬어요. {fmtClock(left)} 뒤 다음 대화가 시작돼요.</p>
        </div>
      )}
    </div>
  );
}
