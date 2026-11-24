// 운영자 기능 (x-admin-key 헤더가 HIRO_ADMIN_KEY와 같아야 해요) + 1분마다 도는 예약 작업
import { z } from "zod";
import { adminOverview, createTestSlot, grantByCode, seedDemo, seedLobby, startSlotNow } from "../../_shared/admin.ts";
import { ALL_TAGS } from "../../_shared/questions.ts";
import { applyCatalog, cancelEvent, createCuratedEvent, planCatalog } from "../../_shared/slots.ts";
import { env } from "../../_shared/env.ts";
import { tx } from "../../_shared/server/db.ts";
import { fail } from "../../_shared/server/http.ts";
import { runTick } from "../../_shared/server/tick.ts";
import { inWorld, snapshot } from "../../_shared/server/world-tx.ts";
import type { Ctx } from "../router.ts";

export async function getOverview() {
  await runTick();
  return inWorld(() => adminOverview());
}

export async function postSeed(ctx: Ctx) {
  const count = Number((ctx.body as { count?: number } | null)?.count ?? 10);
  return { ok: true, added: await inWorld(() => seedDemo(count)) };
}

const LobbyBody = z.union([
  z.object({ action: z.literal("seed"), count: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal("invite"), kind: z.enum(["now", "scheduled"]) }),
]);

/** 테스트용: 데모 참가자를 대기실에 넣거나, 초대장을 지금 바로 만들어요. */
export async function postAdminLobby(ctx: Ctx) {
  const parsed = LobbyBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const d = parsed.data!;
  if (d.action === "seed") return { ok: true, added: await inWorld(() => seedLobby(d.count)) };
  const out = await runTick({ forceInvite: d.kind });
  return { ok: true, invites: out.invites };
}

const SlotBody = z.union([
  z.object({
    action: z.literal("create"),
    minutes: z.number().min(0.5).max(600),
    roundSeconds: z.number().int().min(30).max(1800).optional(),
    demo: z.boolean().optional(),
  }),
  z.object({ action: z.literal("startNow"), slotId: z.string().max(64) }),
]);

export async function postAdminSlot(ctx: Ctx) {
  const parsed = SlotBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const d = parsed.data!;
  if (d.action === "create") return { ok: true, slotId: await inWorld(() => createTestSlot(d.minutes, d.roundSeconds, d.demo)) };
  const err = await inWorld(() => startSlotNow(d.slotId));
  if (err) fail(404, err);
  await runTick({ force: true });
  return { ok: true };
}

const EventCreate = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(2).max(40),
  emoji: z.string().trim().max(8).default("✨"),
  description: z.string().trim().max(120).default(""),
  tags: z.array(z.string()).max(6).default([]),
  icebreakers: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
  startsAt: z.number().int(),
  roundMinutes: z.number().min(0.5).max(30),
  capacity: z.number().int().min(4).max(60),
});
const EventCancel = z.object({ action: z.literal("cancel"), slotId: z.string().max(64) });

/** 운영진 기획 이벤트 만들기 / 취소 */
export async function postEvent(ctx: Ctx) {
  const cancel = EventCancel.safeParse(ctx.body);
  if (cancel.success) {
    const err = await inWorld(() => cancelEvent(cancel.data.slotId));
    if (err) fail(409, err);
    return { ok: true };
  }
  const parsed = EventCreate.safeParse(ctx.body);
  if (!parsed.success) fail(400, "입력값을 확인해 주세요. (테마 이름 2자 이상, 정원 4~60명)");
  const d = parsed.data!;
  if (d.startsAt < Date.now() + 60_000) fail(400, "시작 시간은 지금보다 뒤여야 해요.");
  const slot = await inWorld(() =>
    createCuratedEvent({
      title: d.title,
      emoji: d.emoji,
      description: d.description,
      tags: d.tags.filter((t) => ALL_TAGS.includes(t)),
      icebreakers: d.icebreakers,
      startsAt: d.startsAt,
      roundSeconds: Math.round(d.roundMinutes * 60),
      capacity: d.capacity,
    })
  );
  return { ok: true, slotId: slot.id };
}

const WalletBody = z.object({
  code: z.string().min(4).max(8),
  item: z.enum(["doki", "ticket", "badge"]),
  amount: z.number().int().min(1).max(10000),
  note: z.string().max(100).default("운영자 지급"),
});

export async function postAdminWallet(ctx: Ctx) {
  const parsed = WalletBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "입력값을 확인해 주세요.");
  const d = parsed.data!;
  const out = await inWorld(() => grantByCode(d.code, d.item, d.amount, d.note));
  if (out.error) fail(out.status ?? 400, out.error);
  return { ok: true, note: out.note };
}

/** AI 테마 에이전트로 테마 목록을 새로 만들어요. AI를 기다리는 동안은 잠그지 않아요. */
export async function postCatalog() {
  const out = await planCatalog(await snapshot());
  await inWorld(() => applyCatalog(out));
  return { ok: true, ...out };
}

/** 모든 데이터 지우기 (테스트용). 지갑·기록까지 모두 지워져요. */
export async function postReset() {
  await tx((t) => t`truncate users, ledger, invites, slots, theme_catalog, groups, chats, reports, ticks cascade`);
  return { ok: true };
}

/** 예약 작업(pg_cron)이 1분마다 불러요. x-cron-key 헤더가 HIRO_CRON_KEY와 같아야 해요. */
export async function postTick(ctx: Ctx) {
  const key = env("HIRO_CRON_KEY");
  if (!key || ctx.req.headers.get("x-cron-key") !== key) fail(403, "예약 작업만 부를 수 있어요.");
  return await runTick();
}
