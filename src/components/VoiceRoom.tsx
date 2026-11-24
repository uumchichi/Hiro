"use client";

import "@livekit/components-styles";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";
import { MicButton } from "./MicButton";
import { VoiceOrb } from "./VoiceOrb";
import { apiFetch } from "@/lib/api";

export interface OrbPeople {
  partnerName: string;
  partnerColor: string | null; // 상대가 히로 컬러를 공개했을 때만
  myName: string;
  myColor: string | null;
}

function Inner({ partnerName, partnerColor, myName, myColor }: OrbPeople) {
  const participants = useParticipants();
  const conn = useConnectionState();
  const remote = participants.find((p) => !p.isLocal);
  const partnerHere = Boolean(remote);
  const partnerMuted = Boolean(remote && !remote.isMicrophoneEnabled);
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [switching, setSwitching] = useState(false);
  async function toggleMic() {
    setSwitching(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setSwitching(false);
    }
  }
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
        <VoiceOrb getLevels={() => theirRef.current} color={partnerColor} size={130} label={partnerName} sublabel={partnerHere ? "연결됨" : "기다리는 중"} muted={partnerMuted} />
        <VoiceOrb getLevels={() => myRef.current} color={myColor} size={130} label={myName} sublabel="나" muted={!isMicrophoneEnabled} />
      </div>
      <MicButton on={isMicrophoneEnabled} onToggle={toggleMic} disabled={switching || conn !== ConnectionState.Connected} />
      <p className="text-center text-sm text-muted">
        {conn !== ConnectionState.Connected
          ? "음성 연결 중…"
          : partnerHere
            ? `${partnerName}님과 연결됐어요. 편하게 이야기해 보세요!`
            : `${partnerName}님을 기다리는 중이에요…`}
      </p>
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
    apiFetch("/api/voice/token", { method: "POST" })
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
