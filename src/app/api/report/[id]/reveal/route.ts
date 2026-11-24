import { NextResponse } from "next/server";
import { z } from "zod";
import { revealOwner } from "@/lib/notes";
import { ensureUser } from "@/lib/server";

const Body = z.object({ index: z.number().int().min(0) });

/** 쪽지의 주인 찾기 (한 번만) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const out = revealOwner(user.id, id, parsed.data.index);
  if (out.error) return NextResponse.json({ error: out.error }, { status: 409 });
  return NextResponse.json({ ok: true, chatId: out.chatId ?? null });
}
