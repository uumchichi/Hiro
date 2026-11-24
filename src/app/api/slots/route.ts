import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/server";
import { processDueSlots, slotsView } from "@/lib/slots";

export const dynamic = "force-dynamic";

/** 테마 게시판: 앞으로 열릴 세션과 내가 신청한 세션 */
export async function GET() {
  const user = await ensureUser();
  const now = Date.now();
  processDueSlots(now);
  return NextResponse.json(slotsView(user.id, now));
}
