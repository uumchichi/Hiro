"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MemberCard } from "@/components/MemberCard";
import { NotesPanel } from "@/components/NotesPanel";
import { fmtClock, useHiro, useTick } from "@/components/useHiro";
import { tgColor } from "@/lib/compat";
import { durationForRounds, estimateMine, fmtClockTime } from "@/lib/estimate";

const VoiceRoom = dynamic(() => import("@/components/VoiceRoom"), { ssr: false });
const OrbPreview = dynamic(() => import("@/components/OrbPreview"), { ssr: false });

export default function RoomPage() {
  const router = useRouter();
  const { state, serverNow } = useHiro(2000, { presence: true });
  useTick();

  const group = state?.group;
  useEffect(() => {
    if (!state || group) return;
    // 로테이션이 끝나면 리포트로, 아니면 대기실로
    router.replace(state.lastReportId ? `/report/${state.lastReportId}` : "/lobby");
  }, [state, group, router]);

  if (!state || !group) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const phase = group.phase;
  const now = serverNow();

  if (group.status === "done" || phase.kind === "finished") {
    return (
      <div className="card mt-6 space-y-2 text-center">
        <p className="text-4xl">💌</p>
        <p className="font-bold">로테이션이 끝났어요! 리포트를 준비하고 있어요…</p>
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
        <div className="mt-4 rounded-2xl bg-bg px-4 py-3 text-sm">
          <p className="font-semibold">⏱️ {estimateMine(group.myPartnerCount, group.roundCount, group.roundSeconds, group.breakSeconds)}</p>
          <p className="mt-1 text-xs text-muted">성향 조사에서 서로 원하는 분들끼리만 1:1로 대화해요. 상대가 없는 라운드는 쉬어요.</p>
          <p className="mt-1 text-xs text-muted">
            🎟️ 대화 1번에 입장권 1장, {group.myPartnerCount}장을 예치했어요. 성사된 대화만큼만 쓰이고 나머지는 돌려드려요.
          </p>
          {group.startedAt && (
            <p className="mt-1 text-muted">
              {fmtClockTime(group.startedAt + durationForRounds(group.roundCount, group.roundSeconds, group.breakSeconds))}쯤 끝나요
            </p>
          )}
        </div>
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
        <p className="text-right text-sm font-semibold">
          라운드 {roundNo} / {group.roundCount}
          {group.startedAt && (
            <span className="block text-xs font-normal text-muted">
              {fmtClockTime(group.startedAt + durationForRounds(group.roundCount, group.roundSeconds, group.breakSeconds))}쯤 끝나요
            </span>
          )}
        </p>
      </div>
      {state.wallet?.groupTicket && (
        <p className="text-xs text-muted">
          🎟️ 입장권 {state.wallet.groupTicket.used}장 사용 · {state.wallet.groupTicket.held}장 예치 중. 1:1 대화가 성사될 때마다 1장씩 쓰이고, 남은 건 끝나면 돌려드려요.
        </p>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-hiro" style={{ width: `${((roundNo - (phase.kind === "talk" ? 1 : 0)) / group.roundCount) * 100}%` }} />
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
            {(() => {
              const people = {
                partnerName: partner.nickname,
                partnerColor: partner.tgColor, // 상대가 공개했을 때만 색이 있어요
                myName: state.user.profile?.nickname ?? "나",
                myColor: state.user.matchTraits ? tgColor(state.user.matchTraits.tg) : null,
              };
              if (!state.voice.configured)
                return (
                  <OrbPreview
                    {...people}
                    note="음성 서버(LiveKit)가 아직 설정되지 않아 화면 흐름만 진행돼요. LiveKit 키를 넣으면 실제 음성 대화가 연결돼요."
                  />
                );
              if (partner.id.startsWith("demo_"))
                return <OrbPreview {...people} note="데모 참가자는 음성에 들어오지 않아요. 실제 사용자끼리 매칭되면 음성 대화가 연결돼요." />;
              return group.room ? <VoiceRoom room={group.room} {...people} /> : null;
            })()}
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
          <p className="mt-1 text-muted">이번 라운드에는 서로 원하는 조건이 맞는 대화 상대가 없어요. {fmtClock(left)} 뒤 다음 라운드가 시작돼요.</p>
        </div>
      )}

      <NotesPanel
        groupId={group.id}
        met={group.met}
        focusId={phase.kind === "talk" && partner ? partner.id : (group.met[group.met.length - 1]?.member.id ?? null)}
      />
    </div>
  );
}
