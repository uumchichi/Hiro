// 도키 지갑: 미리 바꾸기, 자동 교환 설정
import { z } from "zod";
import { tx } from "../../_shared/server/db.ts";
import { fail } from "../../_shared/server/http.ts";
import { exchange, setAutoExchange, walletView } from "../../_shared/server/wallet.ts";
import type { Ctx } from "../router.ts";

export function getWallet(ctx: Ctx): Promise<unknown> {
  if (ctx.user.isDemo) fail(400, "지갑을 쓸 수 없어요.");
  return tx((t) => walletView(t, ctx.user.id));
}

const Body = z.union([
  z.object({ action: z.literal("exchange"), item: z.enum(["ticket", "badge"]), count: z.number().int().min(1).max(20) }),
  z.object({ action: z.literal("autoExchange"), on: z.boolean() }),
]);

export function postWallet(ctx: Ctx): Promise<unknown> {
  const parsed = Body.safeParse(ctx.body);
  if (!parsed.success) fail(400, "잘못된 요청이에요.");
  if (ctx.user.isDemo) fail(400, "지갑을 쓸 수 없어요.");
  const d = parsed.data!;
  return tx(async (t) => {
    const uid = ctx.user.id;
    if (d.action === "autoExchange") {
      await walletView(t, uid); // 지갑이 없으면 먼저 만들어요
      await setAutoExchange(t, uid, d.on);
      return walletView(t, uid);
    }
    await walletView(t, uid);
    const err = await exchange(t, uid, d.item, d.count);
    // 실패해도 지갑 화면은 최신으로 보여줘요 (409와 함께).
    if (err) fail(409, err, await walletView(t, uid));
    return walletView(t, uid);
  });
}
