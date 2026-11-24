import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser } from "@/lib/server";
import { setApplied } from "@/lib/slots";

const Body = z.object({ slotId: z.string(), on: z.boolean() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  if (!user.analysis) return NextResponse.json({ error: "성향 검사를 먼저 해 주세요." }, { status: 400 });
  const err = setApplied(user.id, parsed.data.slotId, parsed.data.on);
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  return NextResponse.json({ ok: true });
}
