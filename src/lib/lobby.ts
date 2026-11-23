// 대기실 + AI 초대장 (두 종류)
// · 바로 시작: 대기실에 접속해 있는 사람 중 서로 조건이 맞는 사람들에게 보내고,
//   60초 안에 선착순으로 수락한 4~6명이 바로 시작합니다.
// · 예약: 선호 시간대가 겹치는 시간(예: 금요일 저녁 7시)을 정해 보내고,
//   기한 안에 선착순 4~6명이 수락하면 그 시간의 세션이 확정됩니다.
// 마감·무산된 사람은 다음 초대에서 우선권을 받습니다.
import { aiEnabled, suggestInvite } from "./ai";
import { bestGroup, canMeet, prune } from "./meet";
import { BREAK_SECONDS, ROUND_SECONDS, createGroup } from "./groups";
import { GROUP_MAX, GROUP_MIN, pairScore } from "./heuristics";
import { upcomingCells } from "./schedule";
import { catalogThemes, createConfirmedSlot } from "./slots";
import { mutate, newId, readDb } from "./store";
import type { DB, Invite, Theme, User } from "./types";

export const INVITE_TTL_MS = Number(process.env.HIRO_INVITE_SECONDS ?? 60) * 1000;
const INVITE_SIZE = Number(process.env.HIRO_INVITE_SIZE ?? 8); // 초대장을 보내는 최대 인원
const PRESENCE_MS = 40_000; // 이 시간 안에 신호가 있어야 '접속 중'
const MIN_WAIT_MS = 20_000; // 인원이 꽉 차지 않았으면 이만큼 기다렸다가 초대
const TICK_MS = 3_000;
const START_IN_MS = 10_000; // 그룹이 정해진 뒤 첫 라운드까지

const SCHED_TICK_MS = 30_000;
const SCHED_MIN_LEAD_MS = 3 * 3600_000; // 예약은 최소 3시간 뒤부터
const SCHED_MAX_TTL_MS = 12 * 3600_000; // 예약 초대 수락 기한은 최대 12시간
const SCHED_CLOSE_BEFORE_MS = 2 * 3600_000; // 시작 2시간 전에는 수락 마감
const SCHED_CLASH_MS = 2 * 3600_000; // 이미 확정된 예약과 2시간 안쪽이면 겹침

type Kind = Invite["kind"];

// ───────────── 대기실 입장·퇴장 ─────────────

export function joinLobby(userId: string, interests?: string[]) {
  mutate((db) => {
    const now = Date.now();
    const cur = db.lobby[userId];
    db.lobby[userId] = {
      joinedAt: cur?.joinedAt ?? now,
      lastSeen: now,
      interests: interests ?? cur?.interests ?? [],
      priority: cur?.priority ?? 0,
      note: cur?.note,
    };
  });
}

export function leaveLobby(userId: string) {
  mutate((db) => {
    delete db.lobby[userId];
    // 열려 있는 '바로 시작' 초대장은 거절로 처리 (예약 초대는 그대로)
    for (const inv of Object.values(db.invites)) {
      if (inv.kind === "now" && inv.status === "open" && pending(inv).includes(userId)) inv.declined.push(userId);
    }
  });
}

export function pingLobby(userId: string) {
  mutate((db) => {
    if (db.lobby[userId]) db.lobby[userId].lastSeen = Date.now();
  });
}

export function setInterests(userId: string, interests: string[]) {
  mutate((db) => {
    if (db.lobby[userId]) db.lobby[userId].interests = interests;
  });
}

export function isOnline(db: DB, userId: string, now = Date.now()) {
  const e = db.lobby[userId];
  if (!e) return false;
  return db.users[userId]?.isDemo || now - e.lastSeen < PRESENCE_MS;
}

function pending(inv: Invite) {
  return inv.invitees.filter((id) => !inv.accepted.includes(id) && !inv.declined.includes(id));
}

/** 같은 종류의 열린 초대를 이미 받은 사람 */
function busyWith(db: DB, kind: Kind) {
  return new Set(
    Object.values(db.invites)
      .filter((i) => i.kind === kind && i.status === "open")
      .flatMap((i) => i.invitees.filter((id) => !i.declined.includes(id))),
  );
}

/** 바로 시작 초대를 받을 수 있는 사람: 접속 중, 그룹 없음, 열린 초대 없음 */
function availableNow(db: DB, now: number) {
  const busy = busyWith(db, "now");
  return Object.keys(db.lobby).filter(
    (id) => db.users[id] && db.users[id].status !== "grouped" && db.users[id].analysis && !busy.has(id) && isOnline(db, id, now),
  );
}

/** 예약 초대를 받을 수 있는 사람: 선호 시간대가 있고, 열린 예약 초대가 없음 (접속하지 않아도 됨) */
function availableScheduled(db: DB) {
  const busy = busyWith(db, "scheduled");
  return Object.values(db.users)
    .filter((u) => u.analysis && u.availability?.length && !busy.has(u.id))
    .map((u) => u.id);
}

/** 그 시간 근처에 이미 확정된 예약이 있는지 */
function hasClash(db: DB, userId: string, startsAt: number) {
  return Object.values(db.slots).some(
    (s) => s.status === "open" && s.applicants.includes(userId) && Math.abs(s.startsAt - startsAt) < SCHED_CLASH_MS,
  );
}

// ───────────── 초대 응답 ─────────────

export function respond(userId: string, inviteId: string, accept: boolean): string | null {
  return mutate((db) => {
    const inv = db.invites[inviteId];
    if (!inv || !inv.invitees.includes(userId)) return "초대장을 찾을 수 없어요.";
    if (inv.accepted.includes(userId) || inv.declined.includes(userId)) return null;
    if (inv.status !== "open" || Date.now() > inv.expiresAt) {
      bumpPriority(db, userId, "아쉽게도 마감됐어요. 다음 초대에서 우선으로 불러 드릴게요.");
      return "이미 마감된 초대예요.";
    }
    if (!accept) {
      inv.declined.push(userId);
      return null;
    }
    if (inv.kind === "scheduled" && hasClash(db, userId, inv.startsAt!)) return "그 시간 근처에 이미 확정된 예약이 있어요.";
    inv.accepted.push(userId);
    settle(db, inv, Date.now());
    return null;
  });
}

function bumpPriority(db: DB, userId: string, note: string) {
  const e = db.lobby[userId];
  if (e) {
    e.priority += 1;
    e.note = note;
  } else {
    // 대기실 밖에 있는 사람도 우선권은 기억해 둡니다.
    db.lobby[userId] = { joinedAt: Date.now(), lastSeen: 0, interests: [], priority: 1, note };
  }
}

/** 수락이 꽉 찼거나, 기한이 끝났는데 최소 인원이 모였으면 시작(또는 예약 확정)합니다. */
function settle(db: DB, inv: Invite, now: number) {
  if (inv.status !== "open") return;
  const full = inv.accepted.length >= GROUP_MAX;
  const timeUp = now >= inv.expiresAt;
  const nobodyLeft = pending(inv).length === 0;
  if (!full && !timeUp && !nobodyLeft) return;

  // 수락한 사람들(먼저 수락한 순서) 중에서, 각자 최소 MIN_PARTNERS명과 대화할 수 있는 그룹을 만들어요.
  const accepted = (inv.kind === "now" ? inv.accepted.filter((id) => db.users[id]?.status !== "grouped") : inv.accepted)
    .map((id) => db.users[id])
    .filter(Boolean);
  const viable = accepted.length <= GROUP_MAX ? prune(accepted, GROUP_MIN) : bestGroup(accepted, GROUP_MIN, GROUP_MAX);
  const members = viable ? viable.map((u) => u.id) : [];

  if (members.length >= GROUP_MIN) {
    if (inv.kind === "now") {
      const group = createGroup(db, {
        theme: inv.theme,
        memberIds: members,
        reason: `AI가 '${inv.theme.title}' 테마로 초대한 분들이에요.`,
        startInMs: START_IN_MS,
      });
      inv.status = "started";
      inv.groupId = group.id;
    } else {
      const slot = createConfirmedSlot(db, inv.theme, inv.startsAt!, members);
      inv.status = "confirmed";
      inv.slotId = slot.id;
    }
    for (const id of inv.accepted.filter((id) => !members.includes(id))) {
      bumpPriority(db, id, "이번 그룹에서는 대화할 수 있는 분이 모자랐거나 선착순이 마감됐어요. 다음 초대에서 우선으로 불러 드릴게요.");
    }
  } else if (timeUp || nobodyLeft) {
    inv.status = "expired";
    for (const id of inv.accepted) bumpPriority(db, id, "수락한 인원이 모자라 이번 초대는 무산됐어요. 다음 초대에서 우선으로 불러 드릴게요.");
  }
}

// ───────────── 초대장 만들기 ─────────────

function interestsOf(db: DB, userId: string) {
  return db.lobby[userId]?.interests ?? [];
}

/** 관심 테마 조건을 만족하는지 (관심 테마가 없으면 아무 테마나 OK) */
function wantsTheme(db: DB, userId: string, theme: Theme) {
  const interests = interestsOf(db, userId);
  return interests.length === 0 || interests.includes(theme.id);
}

/**
 * 초대할 사람들을 고릅니다. 각자 그룹 안에서 최소 MIN_PARTNERS명과 대화할 수 있고, 대화할 수 있는 쌍이 많게.
 * 우선권·대기 시간이 긴 사람이 먼저 고려되고, 원하는 상대 성향 궁합이 좋은 쪽을 골라요.
 */
export function pickClique(db: DB, ids: string[], max: number): string[] {
  const prio = (id: string) => db.lobby[id]?.priority ?? 0;
  const since = (id: string) => db.lobby[id]?.joinedAt ?? db.users[id].createdAt;
  const order = [...ids].sort((a, b) => prio(b) - prio(a) || since(a) - since(b)).map((id) => db.users[id]);
  const fit = (g: User[]) => {
    let s = 0;
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) if (canMeet(g[i], g[j])) s += pairScore(g[i], g[j]);
    // 우선권 있는 사람이 들어가면 가산점
    return s + g.reduce((n, u) => n + prio(u.id) * 5, 0);
  };
  const g = bestGroup(order, GROUP_MIN, max, fit);
  return g ? g.map((u) => u.id) : [];
}

function themeScore(db: DB, theme: Theme, ids: string[]) {
  const tagHits = ids.reduce((s, id) => s + theme.tags.filter((t) => db.users[id].profile?.tags.includes(t)).length, 0);
  const explicit = ids.filter((id) => interestsOf(db, id).includes(theme.id)).length;
  return explicit * 3 + tagHits;
}

/** 규칙 기반: 가장 많은 사람이 함께할 수 있는 테마(와 시간) */
function rulePlan(db: DB, ids: string[], themes: Theme[], cells?: { key: string; startsAt: number }[]) {
  let best: { theme: Theme; memberIds: string[]; startsAt?: number; score: number } | null = null;
  const slotsToTry = cells ?? [undefined];
  for (const cell of slotsToTry) {
    const pool = cell ? ids.filter((id) => db.users[id].availability?.includes(cell.key) && !hasClash(db, id, cell.startsAt)) : ids;
    if (pool.length < GROUP_MIN) continue;
    for (const theme of themes) {
      const fans = pool.filter((id) => wantsTheme(db, id, theme));
      if (fans.length < GROUP_MIN) continue;
      const clique = pickClique(db, fans, INVITE_SIZE);
      if (clique.length < GROUP_MIN) continue;
      // 인원이 많을수록, 테마와 잘 맞을수록, (예약은) 더 가까운 시간일수록 좋음
      const soon = cell ? -(cell.startsAt - Date.now()) / 86400_000 : 0;
      const score = clique.length * 10 + themeScore(db, theme, clique) + soon;
      if (!best || score > best.score) best = { theme, memberIds: clique, startsAt: cell?.startsAt, score };
    }
  }
  return best;
}

const g = globalThis as unknown as { __hiroTick?: Record<Kind, number>; __hiroBusy?: Record<Kind, boolean> };

/** 요청이 들어올 때마다 가볍게 호출됩니다: 데모 응답, 마감 처리, 새 초대장 만들기 */
export function processLobby(now = Date.now(), force?: Kind) {
  mutate((db) => {
    for (const inv of Object.values(db.invites)) {
      if (inv.status !== "open") continue;
      for (const [id, plan] of Object.entries(inv.demoPlan ?? {})) {
        if (now < plan.at || inv.accepted.includes(id) || inv.declined.includes(id)) continue;
        if (plan.accept && !(inv.kind === "scheduled" && hasClash(db, id, inv.startsAt!))) inv.accepted.push(id);
        else inv.declined.push(id);
      }
      settle(db, inv, now);
    }
    for (const inv of Object.values(db.invites)) {
      const keep = inv.kind === "scheduled" ? (inv.startsAt ?? 0) + 3600_000 : inv.createdAt + 3600_000;
      if (inv.status !== "open" && now > keep) delete db.invites[inv.id];
    }
  });

  g.__hiroTick ??= { now: 0, scheduled: 0 };
  g.__hiroBusy ??= { now: false, scheduled: false };

  // 바로 시작 초대
  if (!g.__hiroBusy.now && (force === "now" || now - g.__hiroTick.now >= TICK_MS)) {
    g.__hiroTick.now = now;
    const db = readDb();
    const ids = availableNow(db, now);
    const longestWait = ids.length ? Math.max(...ids.map((id) => now - db.lobby[id].joinedAt)) : 0;
    if (ids.length >= GROUP_MIN && (force === "now" || ids.length >= INVITE_SIZE || longestWait >= MIN_WAIT_MS)) {
      run("now", ids, now);
    }
  }

  // 예약 초대
  if (!g.__hiroBusy.scheduled && (force === "scheduled" || now - g.__hiroTick.scheduled >= SCHED_TICK_MS)) {
    g.__hiroTick.scheduled = now;
    const ids = availableScheduled(readDb());
    if (ids.length >= GROUP_MIN) run("scheduled", ids, now);
  }
}

function run(kind: Kind, ids: string[], now: number) {
  g.__hiroBusy![kind] = true;
  makeInvite(kind, ids, now)
    .catch((err) => console.error(`[lobby] makeInvite(${kind}) failed`, err))
    .finally(() => {
      g.__hiroBusy![kind] = false;
    });
}

async function makeInvite(kind: Kind, ids: string[], now: number) {
  const db = readDb();
  const themes = catalogThemes();
  const cells = kind === "scheduled" ? upcomingCells(now, SCHED_MIN_LEAD_MS) : undefined;
  let plan: { theme: Theme; memberIds: string[]; startsAt?: number } | null = null;
  let source: "ai" | "rule" = "rule";

  if (aiEnabled()) {
    const pool = ids.map((id) => ({
      user: db.users[id],
      interests: interestsOf(db, id),
      priority: db.lobby[id]?.priority ?? 0,
      waitedSec: kind === "now" ? Math.round((now - db.lobby[id].joinedAt) / 1000) : undefined,
    }));
    // 예약이면 가능한 사람이 많은 시간 후보 12개만 AI에게 보여 줍니다.
    const cellInfo = cells
      ?.map((c) => ({
        key: c.key,
        startsAt: c.startsAt,
        label: new Date(c.startsAt).toLocaleString("ko-KR", { weekday: "long", month: "long", day: "numeric", hour: "numeric" }),
        available: ids.filter((id) => db.users[id].availability?.includes(c.key) && !hasClash(db, id, c.startsAt)),
      }))
      .filter((c) => c.available.length >= GROUP_MIN)
      .sort((a, b) => b.available.length - a.available.length)
      .slice(0, 12);
    if (kind === "now" || (cellInfo && cellInfo.length)) {
      const out = await suggestInvite(
        pool,
        themes,
        { min: GROUP_MIN, max: INVITE_SIZE },
        cellInfo?.map(({ key, label, available }) => ({ key, label, available })),
      );
      const theme = out && themes.find((t) => t.id === out.themeId);
      const cell = kind === "scheduled" ? cellInfo?.find((c) => c.key === out?.cellKey) : undefined;
      if (out && theme && (kind === "now" || cell)) {
        // AI 결과 검증: 후보에 있고, 관심 테마·시간이 맞고, 모두 서로 조건이 맞게
        const allowed = new Set(cell ? cell.available : ids);
        const raw: User[] = [];
        for (const id of out.memberIds) {
          const u = db.users[id];
          if (!u || !allowed.has(id) || raw.includes(u) || !wantsTheme(db, id, theme) || raw.length >= INVITE_SIZE) continue;
          raw.push(u);
        }
        const kept = prune(raw, GROUP_MIN);
        if (kept) {
          plan = { theme, memberIds: kept.map((u) => u.id), startsAt: cell?.startsAt };
          source = "ai";
        }
      }
    }
  }
  if (!plan) plan = rulePlan(readDb(), ids, themes, cells);
  if (!plan) return;

  const chosen = plan;
  mutate((db) => {
    // 그사이 나갔거나 다른 초대를 받은 사람은 빼기
    const still = new Set(kind === "now" ? availableNow(db, Date.now()) : availableScheduled(db));
    const invitees = chosen.memberIds.filter((id) => still.has(id));
    if (invitees.length < GROUP_MIN) return;
    const created = Date.now();
    const expiresAt =
      kind === "now" ? created + INVITE_TTL_MS : Math.min(created + SCHED_MAX_TTL_MS, chosen.startsAt! - SCHED_CLOSE_BEFORE_MS);
    const inv: Invite = {
      id: newId("inv"),
      kind,
      createdAt: created,
      expiresAt,
      startsAt: chosen.startsAt,
      theme: chosen.theme,
      invitees,
      accepted: [],
      declined: [],
      status: "open",
      source,
      demoPlan: {},
    };
    for (const id of invitees) {
      if (db.users[id].isDemo) {
        // 데모는 초대 후 몇 초~수십 초 안에 응답 (예약도 테스트하기 쉽게 짧게)
        inv.demoPlan![id] = { at: created + 3_000 + Math.random() * 35_000, accept: Math.random() < 0.85 };
      }
      if (db.lobby[id]) db.lobby[id].note = undefined;
    }
    db.invites[inv.id] = inv;
  });
}

// ───────────── 화면용 ─────────────

export function lobbyView(userId: string, now = Date.now()) {
  const db = readDb();
  const me = db.lobby[userId];
  const forMe = Object.values(db.invites)
    .filter((i) => i.invitees.includes(userId) && !i.declined.includes(userId))
    .sort((a, b) => b.createdAt - a.createdAt);
  const nowInv = forMe.find((i) => i.kind === "now");
  const showNow =
    nowInv && (nowInv.status === "open" || (nowInv.status === "started" && nowInv.accepted.includes(userId) && now - nowInv.createdAt < 5 * 60_000));
  const view = (i: Invite) => ({
    id: i.id,
    kind: i.kind,
    theme: { title: i.theme.title, emoji: i.theme.emoji, description: i.theme.description },
    expiresAt: i.expiresAt,
    startsAt: i.startsAt ?? null,
    status: i.status,
    accepted: i.accepted.length,
    invited: i.invitees.length,
    iAccepted: i.accepted.includes(userId),
    iGotIn:
      (i.status === "started" && !!db.groups[i.groupId!]?.memberIds.includes(userId)) ||
      (i.status === "confirmed" && !!db.slots[i.slotId!]?.applicants.includes(userId)),
    slotId: i.slotId ?? null,
  });
  // 확정된 예약 (내가 들어 있는 비공개 세션)
  const reservations = Object.values(db.slots)
    .filter((s) => s.inviteOnly && s.applicants.includes(userId) && (s.status === "open" || s.status === "forming"))
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((s) => ({ slotId: s.id, theme: { title: s.theme.title, emoji: s.theme.emoji }, startsAt: s.startsAt, people: s.applicants.length, roundSeconds: s.roundSeconds ?? ROUND_SECONDS() }));
  return {
    now,
    inLobby: Boolean(me && (me.lastSeen > 0 || db.users[userId]?.isDemo)),
    interests: me?.interests ?? [],
    priority: me?.priority ?? 0,
    note: me?.note ?? null,
    online: Object.keys(db.lobby).filter((id) => isOnline(db, id, now)).length,
    hasAvailability: Boolean(db.users[userId]?.availability?.length),
    config: { min: GROUP_MIN, max: GROUP_MAX, inviteSeconds: INVITE_TTL_MS / 1000, roundSeconds: ROUND_SECONDS(), breakSeconds: BREAK_SECONDS() },
    themes: catalogThemes().map((t) => ({ id: t.id, title: t.title, emoji: t.emoji, description: t.description })),
    invite: showNow ? view(nowInv) : null,
    scheduled: forMe.filter((i) => i.kind === "scheduled" && i.status === "open").map(view),
    reservations,
  };
}

export type LobbyView = ReturnType<typeof lobbyView>;
