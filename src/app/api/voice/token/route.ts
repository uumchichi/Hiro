import { NextResponse } from "next/server";
import { ensureUser, livekitConfigured, livekitToken, viewState } from "@/lib/server";

export async function POST() {
  if (!livekitConfigured()) return NextResponse.json({ error: "LiveKit이 설정되지 않았어요." }, { status: 503 });
  const user = await ensureUser();
  const state = viewState(user.id);
  // 토큰은 지금 라운드에 배정된 방에만 발급합니다.
  if (!state.group?.room) return NextResponse.json({ error: "지금은 대화 시간이 아니에요." }, { status: 409 });
  const token = await livekitToken(user.id, user.profile?.nickname ?? "참가자", state.group.room);
  return NextResponse.json({ token, url: process.env.NEXT_PUBLIC_LIVEKIT_URL, room: state.group.room });
}
