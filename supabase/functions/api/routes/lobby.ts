// 대기실 + AI 초대장
import { z } from "zod";
import { joinLobby, leaveLobby, lobbyView, pingLobby, respond, setInterests } from "../../_shared/lobby.ts";
import { canAfford } from "../../_shared/wallet.ts";
import { fail } from "../../_shared/server/http.ts";
import { background, runTick } from "../../_shared/server/tick.ts";
import { inWorld } from "../../_shared/server/world-tx.ts";
import type { Ctx } from "../router.ts";

/** 대기실 상태 + 나에게 온 초대장. 대기실 화면이 몇 초마다 불러요. */
export async function getLobby(ctx: Ctx) {
  const view = await inWorld(() => {
    pingLobby(ctx.user.id);
    return lobbyView(ctx.user.id);
  });
  await background(runTick());
  return view;
}

const Body = z.object({
  action: z.enum(["join", "leave", "interests"]),
  interests: z.array(z.string()).max(20).optional(),
});

export async function postLobby(ctx: Ctx) {
  const parsed = Body.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const { action, interests } = parsed.data!;
  const out = await inWorld((db) => {
    const u = db.users[ctx.user.id];
    if (!u.analysis) return { status: 400, error: "성향 검사를 먼저 해 주세요." };
    if (u.status === "grouped") return { status: 409, error: "이미 대화 중이에요." };
    if (action === "join" && !canAfford(db, u.id, "ticket")) {
      return { status: 402, error: "입장권이 필요해요. 내 지갑에서 도키를 충전하거나 받을 수 있어요.", extra: { needTicket: true, ...lobbyView(u.id) } };
    }
    if (action === "join") joinLobby(u.id, interests);
    else if (action === "leave") leaveLobby(u.id);
    else setInterests(u.id, interests ?? []);
    return { view: lobbyView(u.id) };
  });
  if ("error" in out) fail(out.status!, out.error!, out.extra);
  await background(runTick());
  return out.view;
}

const RespondBody = z.object({ inviteId: z.string().max(64), accept: z.boolean() });

export async function postInviteRespond(ctx: Ctx) {
  const parsed = RespondBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  const out = await inWorld(() => {
    const err = respond(ctx.user.id, parsed.data!.inviteId, parsed.data!.accept);
    return { err, view: lobbyView(ctx.user.id) };
  });
  if (out.err) fail(409, out.err, out.view);
  return out.view;
}
