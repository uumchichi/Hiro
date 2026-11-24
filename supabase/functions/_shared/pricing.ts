// 도키 가격표: 입장권 / 직진러의 증표 묶음, 가입 선물, 충전 상품
import { env } from "./env.ts";

export type ShopItem = "ticket" | "badge";

export const PRICE = {
  ticket: () => Number(env("HIRO_TICKET_DOKI") ?? 10),
  badge: () => Number(env("HIRO_BADGE_DOKI") ?? 30),
};

export function unitPrice(item: ShopItem) {
  return item === "ticket" ? PRICE.ticket() : PRICE.badge();
}

/**
 * 묶음 할인. 정해진 묶음으로만 바꿀 수 있어요 (가격 계산이 어긋나지 않도록).
 * 1개짜리는 항상 기본 가격이고, 자동 교환도 1개 가격으로 바꿔요.
 */
export function bundles(item: ShopItem) {
  const unit = unitPrice(item);
  const list = item === "ticket" ? [1, 5, 10] : [1, 3];
  const discount: Record<number, number> = item === "ticket" ? { 1: 0, 5: 10, 10: 20 } : { 1: 0, 3: 11 };
  return list.map((count) => {
    const full = unit * count;
    const price = Math.round((full * (100 - discount[count])) / 100);
    return { count, price, full, discount: discount[count] };
  });
}

export function priceOf(item: ShopItem, count: number) {
  return bundles(item).find((b) => b.count === count)?.price ?? null;
}

export const STARTER = {
  tickets: () => Number(env("HIRO_STARTER_TICKETS") ?? 5),
  badges: () => Number(env("HIRO_STARTER_BADGES") ?? 1),
};

/** 1:1 대화가 이만큼 이어지면 입장권을 차감해요. */
export const TICKET_AFTER_MS = () => Number(env("HIRO_TICKET_AFTER_SECONDS") ?? 30) * 1000;

/** 충전 상품 (결제 연결 전이라 화면에만 보여요) */
export const DOKI_PACKS = [
  { doki: 50, price: 4900, bonus: 0 },
  { doki: 120, price: 9900, bonus: 20 },
  { doki: 300, price: 22000, bonus: 35 },
];
