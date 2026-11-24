// 로테이션 뒤: 쪽지·메모, 리포트, 쪽지의 주인 찾기, 직진하기, 24시간 채팅, 신고, 내 기록, 음성 토큰
import { z } from "zod";
import {
  LETTER_MAX,
  MEMO_MAX,
  STRAIGHT_MESSAGE_MAX,
  chatView,
  myRecords,
  reportView,
  respondStraight,
  revealOwner,
  saveNote,
  sendMessage,
  sendStraight,
} from "../../_shared/notes.ts";
import { REPORT_REASONS, reportUser } from "../../_shared/reports.ts";
import { publicMember, syncAllGroups, viewState } from "../../_shared/state.ts";
import { livekitConfigured, livekitToken, livekitUrl } from "../../_shared/voice.ts";
import { readDb } from "../../_shared/world.ts";
import { fail } from "../../_shared/server/http.ts";
import { inWorld } from "../../_shared/server/world-tx.ts";
import type { Ctx } from "../router.ts";

const member = (uid: string) => publicMember(readDb().users[uid]);

const NoteBody = z.object({
  groupId: z.string().max(64),
  to: z.string().max(64),
  letter: z.string().max(LETTER_MAX * 2).optional(),
  memo: z.string().max(MEMO_MAX * 2).optional(),
});

/** 쪽지(상대에게, 끝난 뒤 익명 전달)와 메모(나만 보기) 저장 */
export async function postNote(ctx: Ctx) {
  const parsed = NoteBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const { groupId, to, letter, memo } = parsed.data!;
  const err = await inWorld(() => saveNote(ctx.user.id, groupId, to, { letter, memo }));
  if (err) fail(409, err);
  return { ok: true };
}

/** 로테이션 리포트: 받은 쪽지(익명), 내가 보낸 쪽지, 내 메모 */
export async function getReport(ctx: Ctx) {
  const view = await inWorld(() => {
    syncAllGroups();
    return reportView(ctx.user.id, ctx.params.id, member);
  });
  if (!view) fail(404, "리포트를 찾을 수 없어요.");
  return view;
}

const RevealBody = z.object({ index: z.number().int().min(0).max(100) });

/** 쪽지의 주인 찾기 (한 번만) */
export async function postReveal(ctx: Ctx) {
  const parsed = RevealBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const out = await inWorld(() => revealOwner(ctx.user.id, ctx.params.id, parsed.data!.index));
  if (out.error) fail(409, out.error);
  return { ok: true, chatId: out.chatId ?? null };
}

const StraightBody = z.union([
  z.object({ action: z.literal("send"), to: z.string().max(64), message: z.string().max(STRAIGHT_MESSAGE_MAX * 2).default("") }),
  z.object({ action: z.literal("respond"), from: z.string().max(64), accept: z.boolean() }),
]);

/** 직진하기 보내기 / 받은 직진에 수락·거절 */
export async function postStraight(ctx: Ctx) {
  const parsed = StraightBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const d = parsed.data!;
  if (d.action === "send") {
    const err = await inWorld(() => sendStraight(ctx.user.id, ctx.params.id, d.to, d.message));
    if (err) fail(409, err);
    return { ok: true };
  }
  const out = await inWorld(() => respondStraight(ctx.user.id, ctx.params.id, d.from, d.accept));
  if (out.error) fail(409, out.error);
  return { ok: true, chatId: out.chatId ?? null };
}

/** 내 기록: 지난 로테이션 리포트와 열려 있는 채팅방 */
export function getRecords(ctx: Ctx): Promise<unknown> {
  return inWorld(() => {
    syncAllGroups();
    return myRecords(ctx.user.id, member);
  });
}

export async function getChat(ctx: Ctx) {
  const view = await inWorld(() => chatView(ctx.user.id, ctx.params.id, member));
  if (!view) fail(404, "채팅방이 없거나 24시간이 지나 사라졌어요.");
  return view;
}

const ChatBody = z.object({ text: z.string().min(1).max(2000) });

export async function postChat(ctx: Ctx) {
  const parsed = ChatBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "메시지를 입력해 주세요.");
  const out = await inWorld(() => {
    const err = sendMessage(ctx.user.id, ctx.params.id, parsed.data!.text);
    return err ? { err } : { view: chatView(ctx.user.id, ctx.params.id, member) };
  });
  if (out.err) fail(409, out.err);
  return out.view;
}

const ReportBody = z.object({
  code: z.string().min(4).max(8),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).default(""),
  context: z.string().max(100).default(""),
});

/** 공개 ID로 사용자를 신고해요. */
export async function postUserReport(ctx: Ctx) {
  const parsed = ReportBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "신고 내용을 확인해 주세요.");
  const d = parsed.data!;
  const err = await inWorld(() => reportUser(ctx.user.id, d.code, d.reason, d.detail, d.context));
  if (err) fail(404, err);
  return { ok: true };
}

/** 음성 대화방 입장 토큰: 지금 라운드에 배정된 방에만 */
export async function postVoiceToken(ctx: Ctx) {
  if (!livekitConfigured()) fail(503, "LiveKit이 설정되지 않았어요.");
  const state = await inWorld(() => viewState(ctx.user.id));
  const room = state.group?.room;
  if (!room) return fail(409, "지금은 대화 시간이 아니에요.");
  const token = await livekitToken(ctx.user.id, ctx.user.profile?.nickname ?? "참가자", room);
  return { token, url: livekitUrl(), room };
}
