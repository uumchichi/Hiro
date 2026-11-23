import { NextResponse } from "next/server";
import { z } from "zod";
import { STRAIGHT_MESSAGE_MAX, respondStraight, sendStraight } from "@/lib/notes";
import { ensureUser } from "@/lib/server";

const Body = z.union([
  z.object({ action: z.literal("send"), to: z.string(), message: z.string().max(STRAIGHT_MESSAGE_MAX * 2).default("") }),
  z.object({ action: z.literal("respond"), from: z.string(), accept: z.boolean() }),
]);

/** 직진하기 보내기 / 받은 직진에 수락·거절 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  if (parsed.data.action === "send") {
    const err = sendStraight(user.id, id, parsed.data.to, parsed.data.message);
    if (err) return NextResponse.json({ error: err }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const out = respondStraight(user.id, id, parsed.data.from, parsed.data.accept);
  if (out.error) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ ok: true, chatId: out.chatId ?? null });
}
