// 지갑: 실제 계산은 DB 함수(wallet_*)가 지갑 행을 잠그고 처리해요. 여기서는 부르기만 해요.
import { DOKI_PACKS, PRICE, STARTER, TICKET_AFTER_MS, type ShopItem, bundles, priceOf, unitPrice } from "../pricing.ts";
import type { Sql, Tx } from "./db.ts";

type Q = Sql | Tx;

/** 지갑이 없으면 만들고 가입 선물을 줘요. 데모 참가자는 false. */
export async function ensureWallet(q: Q, userId: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }[]>`select wallet_ensure(${userId}, ${STARTER.tickets()}, ${STARTER.badges()}) as ok`;
  return r.ok;
}

export async function available(q: Q, userId: string, item: ShopItem): Promise<number> {
  const [r] = await q<{ n: number | null }[]>`select wallet_available(${userId}, ${item}) as n`;
  // 아직 지갑이 없으면 가입 선물만큼 쓸 수 있다고 봐요 (처음 들어올 때 만들어져요).
  return r.n ?? (item === "ticket" ? STARTER.tickets() : STARTER.badges());
}

/** count개를 지금 쓸 수 있거나, 모자란 만큼 자동 교환으로 바로 마련할 수 있는지 (데모는 항상 가능) */
export async function canAfford(q: Q, userId: string, item: ShopItem, count = 1): Promise<boolean> {
  const [u] = await q<{ is_demo: boolean }[]>`select is_demo from users where id = ${userId}`;
  if (!u) return false;
  if (u.is_demo) return true;
  const short = count - (await available(q, userId, item));
  if (short <= 0) return true;
  const [w] = await q<{ doki: number; auto_exchange: boolean }[]>`
    select free_doki + paid_doki as doki, auto_exchange from wallets where user_id = ${userId}`;
  if (!w || !w.auto_exchange) return false;
  return w.doki >= short * unitPrice(item);
}

export async function holdMany(q: Q, userId: string, item: ShopItem, refs: string[], note: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }[]>`select wallet_hold_many(${userId}, ${item}, ${refs}, ${note}, ${unitPrice(item)}) as ok`;
  return r.ok;
}

export async function consume(q: Q, userId: string, ref: string, note: string): Promise<boolean> {
  const [r] = await q<{ ok: boolean }[]>`select wallet_consume(${userId}, ${ref}, ${note}) as ok`;
  return r.ok;
}

/** noteTemplate의 %s 자리에 돌려준 개수가 들어가요. */
export async function releasePrefix(q: Q, userId: string, prefix: string, noteTemplate: string): Promise<number> {
  const [r] = await q<{ n: number }[]>`select wallet_release_prefix(${userId}, ${prefix}, ${noteTemplate}) as n`;
  return r.n;
}

export async function exchange(q: Q, userId: string, item: ShopItem, count: number): Promise<string | null> {
  const cost = priceOf(item, count);
  if (cost === null) return "바꿀 수 없는 수량이에요.";
  const [r] = await q<{ err: string | null }[]>`select wallet_exchange(${userId}, ${item}, ${count}, ${cost}) as err`;
  return r.err;
}

export async function setAutoExchange(q: Q, userId: string, on: boolean) {
  await q`update wallets set auto_exchange = ${on} where user_id = ${userId}`;
}

export async function grant(q: Q, userId: string, item: "doki" | ShopItem, amount: number, note: string) {
  await q`select wallet_grant(${userId}, ${item}, ${amount}, ${note})`;
}

/** 대기실·상태 화면용 요약 */
export async function walletSummary(q: Q, userId: string, groupId: string | null) {
  const [w] = await q<{ tickets: number; badges: number }[]>`
    select wallet_available(${userId}, 'ticket') as tickets, wallet_available(${userId}, 'badge') as badges
    from wallets where user_id = ${userId}`;
  if (!w) return null;
  let groupTicket = null;
  if (groupId) {
    const prefix = `group:${groupId}`;
    const [g] = await q<{ held: number; used: number }[]>`
      select
        (select count(*) from wallet_holds where user_id = ${userId} and (ref = ${prefix} or ref like ${prefix + ":%"}))::int as held,
        (select count(*) from ledger where user_id = ${userId} and kind = 'use' and (ref = ${prefix} or ref like ${prefix + ":%"}))::int as used`;
    groupTicket = g;
  }
  return { tickets: w.tickets, badges: w.badges, groupTicket };
}

/** 지갑 화면 */
export async function walletView(q: Q, userId: string) {
  await ensureWallet(q, userId); // 예전 사용자도 처음 열 때 가입 선물을 받아요
  const [w] = await q<{ free_doki: number; paid_doki: number; tickets: number; badges: number; auto_exchange: boolean; held_tickets: number; held_badges: number }[]>`
    select w.*,
      (select count(*) from wallet_holds h where h.user_id = w.user_id and h.item = 'ticket')::int as held_tickets,
      (select count(*) from wallet_holds h where h.user_id = w.user_id and h.item = 'badge')::int as held_badges
    from wallets w where w.user_id = ${userId}`;
  const history = await q<{ id: string; at: Date; kind: string; item: string; amount: number; note: string }[]>`
    select id::text, at, kind, item, amount, note from ledger
    where user_id = ${userId} and kind <> 'hold' order by at desc, id desc limit 50`;
  return {
    doki: w.free_doki + w.paid_doki,
    freeDoki: w.free_doki,
    paidDoki: w.paid_doki,
    tickets: w.tickets,
    badges: w.badges,
    heldTickets: w.held_tickets,
    heldBadges: w.held_badges,
    prices: { ticket: PRICE.ticket(), badge: PRICE.badge() },
    bundles: { ticket: bundles("ticket"), badge: bundles("badge") },
    autoExchange: w.auto_exchange,
    ticketAfterSeconds: TICKET_AFTER_MS() / 1000,
    packs: DOKI_PACKS,
    history: history.map((t) => ({ ...t, at: new Date(t.at).getTime() })),
  };
}
