import { NextResponse } from "next/server";
import { z } from "zod";
import { createTestSlot, startSlotNow } from "@/lib/admin";
import { isAdmin } from "@/lib/server";

const Body = z.union([
  z.object({
    action: z.literal("create"),
    minutes: z.number().min(0.5).max(600),
    roundSeconds: z.number().int().min(30).max(1800).optional(),
    demo: z.boolean().optional(),
  }),
  z.object({ action: z.literal("startNow"), slotId: z.string() }),
]);

/** 테스트용 세션 만들기, 또는 세션을 지금 바로 시작하기 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  if (parsed.data.action === "create") {
    return NextResponse.json({ ok: true, slotId: createTestSlot(parsed.data.minutes, parsed.data.roundSeconds, parsed.data.demo) });
  }
  const err = startSlotNow(parsed.data.slotId);
  if (err) return NextResponse.json({ error: err }, { status: 404 });
  return NextResponse.json({ ok: true });
}
