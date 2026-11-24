import { NextResponse } from "next/server";
import { z } from "zod";
import { seedLobby } from "@/lib/admin";
import { processLobby } from "@/lib/lobby";
import { isAdmin } from "@/lib/server";

const Body = z.union([
  z.object({ action: z.literal("seed"), count: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("invite"), kind: z.enum(["now", "scheduled"]) }),
]);

/** 테스트용: 데모 참가자를 대기실에 넣거나, 초대장(바로 시작/예약)을 지금 바로 만듭니다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  if (parsed.data.action === "seed") return NextResponse.json({ ok: true, added: seedLobby(parsed.data.count) });
  processLobby(Date.now(), parsed.data.kind);
  return NextResponse.json({ ok: true });
}
