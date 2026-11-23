"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useConnectionState,
  useIsSpeaking,
  useParticipants,
} from "@livekit/components-react";
import { ConnectionState, Track, type Participant } from "livekit-client";
import { useEffect, useState } from "react";

function Speaker({ p }: { p: Participant }) {
  const speaking = useIsSpeaking(p);
  return (
    <li className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${speaking ? "border-ok text-ok" : "border-line"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${speaking ? "animate-pulse bg-ok" : "bg-line"}`} />
      {p.isLocal ? "나" : p.name || "상대"}
    </li>
  );
}

function Inner({ partnerName }: { partnerName: string }) {
  const participants = useParticipants();
  const conn = useConnectionState();
  const partnerHere = participants.some((p) => !p.isLocal);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {participants.map((p) => (
          <Speaker key={p.identity} p={p} />
        ))}
      </ul>
      <p className="text-sm text-muted">
        {conn !== ConnectionState.Connected
          ? "음성 연결 중…"
          : partnerHere
            ? `${partnerName}님과 연결됐어요. 편하게 이야기해 보세요!`
            : `${partnerName}님을 기다리는 중이에요…`}
      </p>
      <TrackToggle source={Track.Source.Microphone} className="btn-ghost">
        마이크
      </TrackToggle>
      <RoomAudioRenderer />
    </div>
  );
}

/** 라운드별 1:1 음성방. room 이름이 바뀌면 새 토큰을 받아 다시 연결합니다. */
export default function VoiceRoom({ room, partnerName }: { room: string; partnerName: string }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConn(null);
    setErr(null);
    fetch("/api/voice/token", { method: "POST" })
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) setErr(d.error ?? "음성 연결에 실패했어요.");
        else setConn({ token: d.token, url: d.url });
      })
      .catch(() => !cancelled && setErr("음성 연결에 실패했어요."));
    return () => {
      cancelled = true;
    };
  }, [room]);

  if (err) return <p className="text-sm font-semibold text-brand">{err}</p>;
  if (!conn) return <p className="text-sm text-muted">음성방 준비 중…</p>;
  return (
    <LiveKitRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      audio
      video={false}
      onError={(e) => setErr(`음성 오류: ${e.message}`)}
    >
      <Inner partnerName={partnerName} />
    </LiveKitRoom>
  );
}
