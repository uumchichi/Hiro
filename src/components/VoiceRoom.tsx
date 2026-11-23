"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useConnectionState,
  useMultibandTrackVolume,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { VoiceOrb } from "./VoiceOrb";

export interface OrbPeople {
  partnerName: string;
  partnerColor: string | null; // 상대가 히로 컬러를 공개했을 때만
  myName: string;
  myColor: string | null;
}

function Inner({ partnerName, partnerColor, myName, myColor }: OrbPeople) {
  const participants = useParticipants();
  const conn = useConnectionState();
  const partnerHere = participants.some((p) => !p.isLocal);
  const mics = useTracks([Track.Source.Microphone]);
  const mine = mics.find((t) => t.participant.isLocal);
  const theirs = mics.find((t) => !t.participant.isLocal);
  const myBands = useMultibandTrackVolume(mine, { bands: 6 });
  const theirBands = useMultibandTrackVolume(theirs, { bands: 6 });
  const myRef = useRef(myBands);
  const theirRef = useRef(theirBands);
  myRef.current = myBands;
  theirRef.current = theirBands;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-center gap-6 py-2">
        <VoiceOrb getLevels={() => theirRef.current} color={partnerColor} size={130} label={partnerName} sublabel={partnerHere ? "연결됨" : "기다리는 중"} />
        <VoiceOrb getLevels={() => myRef.current} color={myColor} size={130} label={myName} sublabel="나" />
      </div>
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
export default function VoiceRoom({ room, ...people }: { room: string } & OrbPeople) {
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
      <Inner {...people} />
    </LiveKitRoom>
  );
}
