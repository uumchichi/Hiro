import { NextResponse } from "next/server";
import { z } from "zod";
import { joinLobby, leaveLobby, lobbyView, pingLobby, processLobby, setInterests } from "@/lib/lobby";
import { ensureUser } from "@/lib/server";
import { readDb } from "@/lib/store";
import { canAfford } from "@/lib/wallet";

export const dynamic = "force-dynamic";

/** 대기실 상태 + 나에게 온 초대장. 대기실 화면이 몇 초마다 부릅니다. */
export async function GET() {
  const user = await ensureUser();
  pingLobby(user.id);
  processLobby();
  return NextResponse.json(lobbyView(user.id));
}

const Body = z.object({
  action: z.enum(["join", "leave", "interests"]),
  interests: z.array(z.string()).max(20).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  if (!user.analysis) return NextResponse.json({ error: "성향 검사를 먼저 해 주세요." }, { status: 400 });
  if (user.status === "grouped") return NextResponse.json({ error: "이미 대화 중이에요." }, { status: 409 });
  const { action, interests } = parsed.data;
  if (action === "join" && !canAfford(readDb(), user.id, "ticket")) {
    return NextResponse.json({ error: "입장권이 필요해요. 내 지갑에서 도키를 충전하거나 받을 수 있어요.", needTicket: true, ...lobbyView(user.id) }, { status: 402 });
  }
  if (action === "join") joinLobby(user.id, interests);
  else if (action === "leave") leaveLobby(user.id);
  else setInterests(user.id, interests ?? []);
  processLobby();
  return NextResponse.json(lobbyView(user.id));
}
