"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceOrb, createMicMeter } from "./VoiceOrb";
import type { OrbPeople } from "./VoiceRoom";

/** 음성 서버 없이 보는 오브: 상대는 잔잔하게 숨쉬고, 내 오브는 내 마이크로 움직여 볼 수 있어요. */
export default function OrbPreview({ partnerName, partnerColor, myName, myColor, note }: OrbPeople & { note: string }) {
  const meter = useRef<ReturnType<typeof createMicMeter> | null>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => () => meter.current?.stop(), []);

  async function toggle() {
    setErr(null);
    if (on) {
      meter.current?.stop();
      meter.current = null;
      setOn(false);
      return;
    }
    try {
      const m = createMicMeter(6);
      await m.start();
      meter.current = m;
      setOn(true);
    } catch {
      setErr("마이크를 쓸 수 없어요. 브라우저의 마이크 권한을 확인해 주세요.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-center gap-6 py-2">
        <VoiceOrb getLevels={() => []} color={partnerColor} size={150} label={partnerName} sublabel="상대" />
        <VoiceOrb getLevels={() => meter.current?.levels() ?? []} color={myColor} size={110} label={myName} sublabel="나" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={on ? "btn-ghost py-2 text-sm" : "btn-primary py-2 text-sm"} onClick={toggle}>
          {on ? "마이크 미리 보기 끄기" : "🎙️ 내 마이크로 움직여 보기"}
        </button>
      </div>
      {err && <p className="text-center text-sm font-semibold text-brand">{err}</p>}
      <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm">{note}</p>
    </div>
  );
}
