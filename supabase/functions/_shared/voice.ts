// LiveKit 음성: 지금 라운드에 배정된 1:1 방에만 입장 토큰을 줘요.
import { AccessToken } from "livekit-server-sdk";
import { env } from "./env.ts";

export function livekitUrl() {
  return env("LIVEKIT_URL") ?? env("NEXT_PUBLIC_LIVEKIT_URL");
}

export function livekitConfigured() {
  return Boolean(env("LIVEKIT_API_KEY") && env("LIVEKIT_API_SECRET") && livekitUrl());
}

export async function livekitToken(identity: string, name: string, room: string) {
  const at = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), { identity, name, ttl: "20m" });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return await at.toJwt();
}
