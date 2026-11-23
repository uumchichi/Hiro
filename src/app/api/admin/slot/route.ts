import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/server";
import { createSlotIn } from "@/lib/slots";
import { mutate, readDb } from "@/lib/store";

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
    const slot = createSlotIn(parsed.data.minutes, parsed.data.roundSeconds);
    if (parsed.data.demo) {
      // 데모 참가자 중 그룹에 들어가 있지 않은 사람을 모두 신청시킵니다.
      mutate((db) => {
        const s = db.slots[slot.id];
        for (const u of Object.values(db.users)) if (u.isDemo && u.status !== "grouped") s.applicants.push(u.id);
      });
    }
    return NextResponse.json({ ok: true, slotId: slot.id });
  }
  const { slotId } = parsed.data;
  if (!readDb().slots[slotId]) return NextResponse.json({ error: "세션이 없어요." }, { status: 404 });
  mutate((db) => {
    db.slots[slotId].startsAt = Date.now();
  });
  return NextResponse.json({ ok: true });
}
