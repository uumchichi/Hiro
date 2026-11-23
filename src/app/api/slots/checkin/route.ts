import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser } from "@/lib/server";
import { checkIn } from "@/lib/slots";

const Body = z.object({ slotId: z.string() });

/** 대기실 화면이 20초마다 보내는 '여기 있어요' 신호 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const err = checkIn(user.id, parsed.data.slotId);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  return NextResponse.json({ ok: true });
}
