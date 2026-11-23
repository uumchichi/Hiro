"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { fmtClock, useHiro, useTick } from "@/components/useHiro";
import { useSlots } from "@/components/useSlots";

/** 세션 대기실: 화면을 켜 두는 동안 '여기 있어요' 신호를 보내고, 그룹이 정해지면 대화방으로 이동합니다. */
function Lobby() {
  const router = useRouter();
  const slotId = useSearchParams().get("slot");
  const { state } = useHiro(3000);
  const { data, serverNow } = useSlots(3000);
  const [err, setErr] = useState<string | null>(null);
  useTick();

  const slot = data?.slots.find((s) => s.id === slotId);

  useEffect(() => {
    if (state?.user.status === "grouped") router.replace("/room");
  }, [state, router]);

  useEffect(() => {
    if (!slotId) return;
    const ping = async () => {
      const res = await fetch("/api/slots/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slotId }),
      });
      setErr(res.ok ? null : ((await res.json().catch(() => ({}))).error ?? "입장하지 못했어요."));
    };
    ping();
    const t = setInterval(ping, 20000);
    return () => clearInterval(t);
  }, [slotId]);

  if (!data) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  if (!slot) {
    return (
      <div className="card mt-6 space-y-4 text-center">
        <p className="text-muted">세션을 찾을 수 없어요.</p>
        <Link href="/themes" className="btn-primary">테마 고르기</Link>
      </div>
    );
  }

  const left = slot.startsAt - serverNow();
  const ended = slot.status === "cancelled" || (slot.status === "started" && slot.missed);

  return (
    <div className="space-y-5 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-hiro px-6 py-10 text-center text-white">
        <span className="orb -right-8 -top-8 h-32 w-32" aria-hidden />
        <p className="relative text-4xl">{slot.theme.emoji}</p>
        <h1 className="relative mt-2 text-2xl font-extrabold">{slot.theme.title}</h1>
        <p className="relative mt-1 text-white/90">{slot.theme.description}</p>
        {!ended && (
          <p className="relative mt-6 text-5xl font-extrabold tabular-nums">
            {slot.status === "open" && left > 0 ? fmtClock(left) : "그룹을 나누는 중…"}
          </p>
        )}
      </div>

      {ended ? (
        <div className="card space-y-3 text-center">
          <p className="font-bold">이번 세션은 함께하지 못했어요</p>
          <p className="text-sm text-muted">{slot.note ?? "다음 세션에서 만나요."}</p>
          <Link href="/themes" className="btn-primary">다른 테마 둘러보기</Link>
        </div>
      ) : (
        <div className="card space-y-2 text-center">
          <p className="font-semibold">
            지금 대기실에 <b className="text-brand">{slot.present}명</b> · 신청 {slot.applicants}명
          </p>
          <p className="text-sm text-muted">
            이 화면을 켜 둔 분들끼리 {data.config.min}~{data.config.max}명씩 그룹이 돼요. 이어폰을 준비해 주세요 🎧
          </p>
          {err && <p className="text-sm font-semibold text-brand">{err}</p>}
        </div>
      )}
    </div>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<p className="pt-10 text-center text-muted">불러오는 중…</p>}>
      <Lobby />
    </Suspense>
  );
}
