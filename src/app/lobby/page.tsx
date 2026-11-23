"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MemberCard } from "@/components/MemberCard";
import { fmtClock, useHiro, useTick } from "@/components/useHiro";

export default function LobbyPage() {
  const router = useRouter();
  const { state, post, error, serverNow } = useHiro(2500);
  useTick();

  const status = state?.user.status;
  const group = state?.group;

  useEffect(() => {
    if (!state) return;
    if (!state.user.analysis) router.replace(state.user.profile ? "/quiz" : "/start");
    else if (group && group.status !== "ready") router.replace("/room");
  }, [state, group, router]);

  if (!state) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;

  if (status === "analyzed") {
    return (
      <div className="card mt-6 space-y-4 text-center">
        <p className="text-4xl">🛋️</p>
        <h1 className="text-xl font-bold">아직 라운지에 들어오지 않았어요</h1>
        <p className="text-muted">입장하면 AI가 비슷한 테마의 사람들과 그룹을 만들어 드려요.</p>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
        <button className="btn-primary" onClick={() => post("/api/queue", { join: true })}>라운지 입장</button>
      </div>
    );
  }

  if (status === "waiting") {
    return (
      <div className="card mt-6 space-y-5 text-center">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-brand-soft text-4xl leading-[4rem]">🧭</div>
        <h1 className="text-xl font-bold">AI가 테마와 그룹을 고르고 있어요</h1>
        <p className="text-muted">
          라운지에 모인 분들의 성향과 태그를 보고 매칭해요.
          <br />이 화면을 켜 두시면 그룹이 정해지는 대로 알려 드릴게요.
        </p>
        <button className="btn-ghost" onClick={() => post("/api/queue", { join: false })}>라운지 나가기</button>
      </div>
    );
  }

  if (!group) return null;
  const startsIn = group.startedAt ? group.startedAt - serverNow() : null;

  return (
    <div className="space-y-5 pt-4">
      <div className="card space-y-3">
        <p className="text-sm font-semibold text-brand">그룹이 정해졌어요!</p>
        <h1 className="text-2xl font-extrabold">
          {group.theme.emoji} {group.theme.title}
        </h1>
        <p className="text-muted">{group.theme.description}</p>
        <p className="rounded-2xl bg-brand-soft px-4 py-3 text-[15px]">🤖 {group.reason}</p>
        <p className="text-sm text-muted">
          {group.members.length}명이 한 명씩 돌아가며 {Math.round(group.roundSeconds / 60)}분씩, 총 {group.roundCount}번 1:1 음성 대화를 해요.
        </p>
        <div className="rounded-2xl border border-line p-4 text-center">
          {startsIn !== null && startsIn > 0 ? (
            <p className="text-lg font-bold">{fmtClock(startsIn)} 뒤 시작해요</p>
          ) : (
            <p className="font-semibold text-muted">운영자가 시작하면 바로 대화방으로 이동해요. 마이크를 준비해 주세요 🎧</p>
          )}
        </div>
      </div>
      <h2 className="font-bold">함께할 사람들</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {group.members.map((m) => (
          <MemberCard key={m.id} m={m} highlight={m.id === state.user.id} />
        ))}
      </div>
      <Link href="/me" className="btn-ghost">내 성향 보기</Link>
    </div>
  );
}
