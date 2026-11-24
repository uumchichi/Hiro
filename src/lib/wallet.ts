// 도키 지갑: 도키를 🎟️ 입장권 / 💘 직진러의 증표로 바꿔 써요.
// · 입장권: 1:1 대화 1번에 1장. 그룹에 들어가면 나와 대화할 사람 수만큼 예치하고,
//   대화가 실제로 이어질 때마다 그 상대 몫 1장씩 차감해요. 남은 건 로테이션이 끝날 때 돌려줘요.
// · 직진러의 증표: 직진 1회에 1개. 보낼 때 맡아 두고, 상대가 수락하면 차감, 거절·만료면 돌려줘요.
import { mutate, newId, readDb } from "./store";
import type { DB, User, Wallet, WalletItem } from "./types";

export const PRICE = {
  ticket: () => Number(process.env.HIRO_TICKET_DOKI ?? 10),
  badge: () => Number(process.env.HIRO_BADGE_DOKI ?? 30),
};

/**
 * 묶음 할인. 정해진 묶음으로만 바꿀 수 있어요 (가격 계산이 어긋나지 않도록).
 * 1개짜리는 항상 기본 가격이고, 자동 교환도 1개 가격으로 바꿔요.
 */
export function bundles(item: "ticket" | "badge") {
  const unit = item === "ticket" ? PRICE.ticket() : PRICE.badge();
  const list = item === "ticket" ? [1, 5, 10] : [1, 3];
  const discount: Record<number, number> = item === "ticket" ? { 1: 0, 5: 10, 10: 20 } : { 1: 0, 3: 11 };
  return list.map((count) => {
    const full = unit * count;
    const price = Math.round((full * (100 - discount[count])) / 100);
    return { count, price, full, discount: discount[count] };
  });
}

function priceOf(item: "ticket" | "badge", count: number) {
  return bundles(item).find((b) => b.count === count)?.price ?? null;
}
export const STARTER = {
  tickets: () => Number(process.env.HIRO_STARTER_TICKETS ?? 5),
  badges: () => Number(process.env.HIRO_STARTER_BADGES ?? 1),
};
/** 첫 1:1 대화가 이만큼 이어지면 입장권을 차감해요. */
export const TICKET_AFTER_MS = () => Number(process.env.HIRO_TICKET_AFTER_SECONDS ?? 30) * 1000;

/** 충전 상품 (결제 연결 전이라 화면에만 보여요) */
export const DOKI_PACKS = [
  { doki: 50, price: 4900, bonus: 0 },
  { doki: 120, price: 9900, bonus: 20 },
  { doki: 300, price: 22000, bonus: 35 },
];

function log(db: DB, userId: string, kind: DB["ledger"][number]["kind"], item: WalletItem, amount: number, note: string, ref?: string) {
  db.ledger.push({ id: newId("tx"), userId, at: Date.now(), kind, item, amount, note, ref });
}

/** 지갑이 없으면 만들고 신규 가입 선물을 줘요. 데모 참가자는 지갑을 쓰지 않아요. mutate() 안에서 호출하세요. */
export function ensureWallet(db: DB, userId: string): Wallet | null {
  const u = db.users[userId];
  if (!u || u.isDemo) return null;
  if (!u.wallet) {
    u.wallet = { freeDoki: 0, paidDoki: 0, tickets: STARTER.tickets(), badges: STARTER.badges(), holds: {}, autoExchange: true };
    if (STARTER.tickets()) log(db, userId, "starter", "ticket", STARTER.tickets(), "가입 선물");
    if (STARTER.badges()) log(db, userId, "starter", "badge", STARTER.badges(), "가입 선물");
  }
  return u.wallet;
}

function held(w: Wallet, item: "ticket" | "badge") {
  return Object.values(w.holds).filter((h) => h.item === item).length;
}

/** 지금 쓸 수 있는 개수 (맡아 둔 것 제외). 데모는 항상 충분해요. */
export function available(db: DB, userId: string, item: "ticket" | "badge") {
  const u = db.users[userId];
  if (u?.isDemo) return Infinity;
  const w = u?.wallet;
  if (!w) return item === "ticket" ? STARTER.tickets() : STARTER.badges(); // 아직 지갑이 없으면 가입 선물만큼
  return (item === "ticket" ? w.tickets : w.badges) - held(w, item);
}

/** 도키를 아이템으로 바꿔요. mutate() 안에서 호출하세요. 무료 도키부터 써요. */
function spendDoki(db: DB, userId: string, w: Wallet, item: "ticket" | "badge", count: number, cost: number, note: string) {
  if (w.freeDoki + w.paidDoki < cost) return false;
  const fromFree = Math.min(w.freeDoki, cost);
  w.freeDoki -= fromFree;
  w.paidDoki -= cost - fromFree;
  if (item === "ticket") w.tickets += count;
  else w.badges += count;
  const name = item === "ticket" ? "입장권" : "직진러의 증표";
  log(db, userId, "exchange", "doki", -cost, `${name} ${count}개로 바꿈${note}`);
  log(db, userId, "exchange", item, count, `${cost}도키로 바꿈${note}`);
  return true;
}

/** count개를 지금 쓸 수 있거나, 모자란 만큼 자동 교환으로 바로 마련할 수 있는지 */
export function canAfford(db: DB, userId: string, item: "ticket" | "badge", count = 1) {
  if (db.users[userId]?.isDemo) return true;
  const short = count - available(db, userId, item);
  if (short <= 0) return true;
  const w = db.users[userId]?.wallet;
  if (!w || w.autoExchange === false) return false;
  return w.freeDoki + w.paidDoki >= short * (item === "ticket" ? PRICE.ticket() : PRICE.badge());
}

/**
 * 여러 개를 한꺼번에 맡아요 (전부 아니면 전무). 모자란 만큼은 자동 교환으로 한 번에 바꿔요.
 * 실패하면 아무것도 바뀌지 않아요. 이미 맡긴 ref는 건너뛰어요.
 */
export function holdMany(db: DB, userId: string, item: "ticket" | "badge", refs: string[], note: string): boolean {
  const w = ensureWallet(db, userId);
  if (!w) return true; // 데모
  const todo = refs.filter((r) => !w.holds[r]);
  if (!todo.length) return true;
  const short = todo.length - available(db, userId, item);
  if (short > 0) {
    const unit = item === "ticket" ? PRICE.ticket() : PRICE.badge();
    if (w.autoExchange === false || !spendDoki(db, userId, w, item, short, unit * short, " (자동 교환)")) return false;
  }
  const at = Date.now();
  for (const r of todo) w.holds[r] = { item, at };
  log(db, userId, "hold", item, 0, `${note} (${todo.length}개)`);
  return true;
}

/** ref가 prefix로 시작하는 맡긴 아이템을 모두 돌려줘요. 돌려준 개수를 한 줄로 기록해요. */
export function releasePrefix(db: DB, userId: string, prefix: string, note: (n: number) => string) {
  const w = db.users[userId]?.wallet;
  if (!w) return 0;
  const refs = Object.keys(w.holds).filter((r) => r === prefix || r.startsWith(prefix + ":"));
  if (!refs.length) return 0;
  const item = w.holds[refs[0]].item;
  for (const r of refs) delete w.holds[r];
  log(db, userId, "release", item, 0, note(refs.length), prefix);
  return refs.length;
}

/**
 * 아이템을 맡아 둬요 (차감 전). 이미 같은 ref로 맡아 뒀으면 그대로 둬요.
 * 쓸 수 있는 아이템이 없고 자동 교환이 켜져 있으면, 이 순간에만 도키로 1개를 바꿔서 맡아요.
 */
export function hold(db: DB, userId: string, item: "ticket" | "badge", ref: string, note: string): boolean {
  const w = ensureWallet(db, userId);
  if (!w) return true; // 데모
  if (w.holds[ref]) return true;
  if (available(db, userId, item) < 1) {
    const unit = item === "ticket" ? PRICE.ticket() : PRICE.badge();
    if (w.autoExchange === false || !spendDoki(db, userId, w, item, 1, unit, " (자동 교환)")) return false;
  }
  w.holds[ref] = { item, at: Date.now() };
  log(db, userId, "hold", item, 0, note, ref);
  return true;
}

/** 맡아 둔 아이템을 실제로 써요. */
export function consume(db: DB, userId: string, ref: string, note: string) {
  const w = db.users[userId]?.wallet;
  const h = w?.holds[ref];
  if (!w || !h) return false;
  delete w.holds[ref];
  if (h.item === "ticket") w.tickets -= 1;
  else w.badges -= 1;
  log(db, userId, "use", h.item, -1, note, ref);
  return true;
}

/** 맡아 둔 아이템을 돌려줘요. */
export function release(db: DB, userId: string, ref: string, note: string) {
  const w = db.users[userId]?.wallet;
  const h = w?.holds[ref];
  if (!w || !h) return false;
  delete w.holds[ref];
  log(db, userId, "release", h.item, 0, note, ref);
  return true;
}

/** 도키로 입장권·증표를 미리 바꿔 둬요 (정해진 묶음만). */
export function exchange(userId: string, item: "ticket" | "badge", count: number): string | null {
  return mutate((db) => {
    const w = ensureWallet(db, userId);
    if (!w) return "지갑을 쓸 수 없어요.";
    const cost = priceOf(item, count);
    if (cost === null) return "바꿀 수 없는 수량이에요.";
    if (!spendDoki(db, userId, w, item, count, cost, "")) return `도키가 모자라요. (${cost}도키 필요)`;
    return null;
  });
}

export function setAutoExchange(userId: string, on: boolean) {
  mutate((db) => {
    const w = ensureWallet(db, userId);
    if (w) w.autoExchange = on;
  });
}

/** 운영자 지급 (결제 연결 전 테스트·이벤트용). 도키는 무료 도키로 들어가요. */
export function grant(userId: string, item: WalletItem, amount: number, note: string) {
  mutate((db) => {
    const w = ensureWallet(db, userId);
    if (!w) return;
    if (item === "doki") w.freeDoki += amount;
    else if (item === "ticket") w.tickets += amount;
    else w.badges += amount;
    log(db, userId, "grant", item, amount, note);
  });
}

export function walletView(userId: string) {
  mutate((db) => {
    ensureWallet(db, userId); // 예전 사용자도 처음 열 때 가입 선물을 받아요
  });
  const db = readDb();
  const u = db.users[userId] as User;
  const w = u.wallet!;
  return {
    doki: w.freeDoki + w.paidDoki,
    freeDoki: w.freeDoki,
    paidDoki: w.paidDoki,
    tickets: w.tickets,
    badges: w.badges,
    heldTickets: held(w, "ticket"),
    heldBadges: held(w, "badge"),
    prices: { ticket: PRICE.ticket(), badge: PRICE.badge() },
    bundles: { ticket: bundles("ticket"), badge: bundles("badge") },
    autoExchange: w.autoExchange !== false,
    ticketAfterSeconds: TICKET_AFTER_MS() / 1000,
    packs: DOKI_PACKS,
    history: db.ledger
      .filter((t) => t.userId === userId && t.kind !== "hold")
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((t) => ({ id: t.id, at: t.at, kind: t.kind, item: t.item, amount: t.amount, note: t.note })),
  };
}

export type WalletView = ReturnType<typeof walletView>;
