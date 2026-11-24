import { NextResponse } from "next/server";
import { storeStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 배포 서비스(Railway·Render)의 상태 확인용. 저장소가 준비됐고 정상 저장 중이면 200이에요. */
export async function GET() {
  const s = storeStatus();
  const ok = s.ready && !s.lostOwnership;
  return NextResponse.json({ ok, store: s }, { status: ok ? 200 : 503 });
}
