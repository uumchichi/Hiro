// 테마 게시판: 이벤트 세션 신청, 대기실 입장 신호
import { z } from "zod";
import { checkIn, setApplied, slotsView } from "../../_shared/slots.ts";
import { fail } from "../../_shared/server/http.ts";
import { background, runTick } from "../../_shared/server/tick.ts";
import { inWorld } from "../../_shared/server/world-tx.ts";
import type { Ctx } from "../router.ts";

export async function getSlots(ctx: Ctx) {
  await background(runTick()); // 시작 시간이 된 세션을 먼저 그룹으로
  return inWorld(() => slotsView(ctx.user.id));
}

const ApplyBody = z.object({ slotId: z.string().max(64), on: z.boolean() });

export async function postApply(ctx: Ctx) {
  const parsed = ApplyBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  if (!ctx.user.analysis) fail(400, "성향 검사를 먼저 해 주세요.");
  const err = await inWorld(() => setApplied(ctx.user.id, parsed.data!.slotId, parsed.data!.on));
  if (err) fail(409, err);
  return { ok: true };
}

const CheckinBody = z.object({ slotId: z.string().max(64) });

/** 대기실 화면이 20초마다 보내는 '여기 있어요' 신호 */
export async function postCheckin(ctx: Ctx) {
  const parsed = CheckinBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const err = await inWorld(() => checkIn(ctx.user.id, parsed.data!.slotId));
  if (err) fail(409, err);
  return { ok: true };
}
