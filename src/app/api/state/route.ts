import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";
import { processLobby } from "@/lib/lobby";
import { recordPresence } from "@/lib/notes";
import { processDueSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await ensureUser();
  // 대화방 화면은 presence=1로 불러서 1:1 대화가 이어지는지 알려요 (입장권 차감 기준).
  if (new URL(req.url).searchParams.get("presence") === "1") recordPresence(user.id);
  processDueSlots();
  processLobby();
  return NextResponse.json(viewState(user.id));
}
