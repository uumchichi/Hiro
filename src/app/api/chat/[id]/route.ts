import { NextResponse } from "next/server";
import { z } from "zod";
import { chatView, sendMessage } from "@/lib/notes";
import { ensureUser, publicMember } from "@/lib/server";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await ensureUser();
  const view = chatView(user.id, id, (uid) => publicMember(readDb().users[uid]));
  if (!view) return NextResponse.json({ error: "채팅방이 없거나 24시간이 지나 사라졌어요." }, { status: 404 });
  return NextResponse.json(view);
}

const Body = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "메시지를 입력해 주세요." }, { status: 400 });
  const user = await ensureUser();
  const err = sendMessage(user.id, id, parsed.data.text);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  return NextResponse.json(chatView(user.id, id, (uid) => publicMember(readDb().users[uid])));
}
