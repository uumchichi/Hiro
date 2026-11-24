// 테마 세션: 테마 게시판 유지, 신청, 대기실 입장, 시작 시간에 자동으로 그룹 만들기
import { env } from "./env.ts";
import { generateCatalog, splitSession } from "./ai.ts";
import { createGroup } from "./groups.ts";
import { GROUP_MIN, balancedPack, ruleCatalog } from "./heuristics.ts";
import { mutate, newId, readDb } from "./world.ts";
import { canAfford } from "./wallet.ts";
import type { DB, Slot, Theme } from "./types.ts";

const MIN = 60_000;
export const CHECKIN_OPEN_MS = Number(env("HIRO_CHECKIN_MINUTES") ?? 10) * MIN; // 시작 몇 분 전부터 대기실 입장
const PRESENCE_MS = 45_000; // 대기실 신호가 이 시간 안에 있어야 '접속 중'
const SLOT_INTERVAL_MS = Number(env("HIRO_SLOT_INTERVAL_MINUTES") ?? 60) * MIN;
const UPCOMING = Number(env("HIRO_UPCOMING_SLOTS") ?? 3); // 게시판에 늘 열려 있는 세션 수
const KEEP_FINISHED_MS = 3 * 60 * MIN;
const COUNTDOWN_MS = 15_000; // 그룹이 정해진 뒤 첫 라운드까지

export function catalogThemes(): Theme[] {
  return readDb().catalog?.themes ?? ruleCatalog();
}

function newSlot(theme: Theme, startsAt: number): Slot {
  return {
    id: newId("s"),
    createdAt: Date.now(),
    theme,
    startsAt,
    status: "open",
    applicants: [],
    checkins: {},
    groupIds: [],
    missed: [],
  };
}

/** 앞으로 열릴 세션이 UPCOMING개보다 적으면 채웁니다. */
export function ensureSlots(now = Date.now()) {
  const db = readDb();
  const open = Object.values(db.slots).filter((s) => s.status === "open" && s.startsAt > now && !s.inviteOnly && !s.curated);
  if (open.length >= UPCOMING) return;
  mutate((db) => {
    const themes = catalogThemes();
    const scheduled = new Set(open.map((s) => s.theme.title));
    let last = Math.max(now, ...open.map((s) => s.startsAt));
    // 다음 정각(또는 간격 단위)부터
    let t = Math.ceil((last + 1) / SLOT_INTERVAL_MS) * SLOT_INTERVAL_MS;
    for (let k = open.length; k < UPCOMING; k++) {
      let theme = themes[db.catalogCursor % themes.length];
      // 이미 올라와 있는 테마는 건너뛰기 (테마가 충분할 때)
      for (let tries = 0; tries < themes.length && scheduled.has(theme.title); tries++) {
        db.catalogCursor++;
        theme = themes[db.catalogCursor % themes.length];
      }
      db.catalogCursor++;
      scheduled.add(theme.title);
      const slot = newSlot(theme, t);
      db.slots[slot.id] = slot;
      last = t;
      t += SLOT_INTERVAL_MS;
    }
    // 오래된 세션 정리
    for (const s of Object.values(db.slots)) {
      if (s.status !== "open" && s.startsAt < now - KEEP_FINISHED_MS) delete db.slots[s.id];
    }
  });
}

/** 테스트용: n분 뒤 시작하는 세션을 바로 만듭니다. */
export function createSlotIn(minutes: number, roundSeconds?: number, themeTitle?: string) {
  const themes = catalogThemes();
  const theme = themes.find((t) => t.title === themeTitle) ?? themes[Math.floor(Math.random() * themes.length)];
  const slot = newSlot(theme, Date.now() + minutes * MIN);
  if (roundSeconds) slot.roundSeconds = roundSeconds;
  mutate((db) => {
    db.slots[slot.id] = slot;
  });
  return slot;
}

/** 운영진이 기획한 이벤트를 특정 날짜·시간에 엽니다. */
export function createCuratedEvent(input: {
  title: string;
  emoji: string;
  description: string;
  tags: string[];
  icebreakers: string[];
  startsAt: number;
  roundSeconds: number;
  capacity: number;
}) {
  const theme: Theme = {
    id: newId("evt"),
    title: input.title,
    emoji: input.emoji || "✨",
    description: input.description,
    tags: input.tags,
    icebreakers: input.icebreakers.length ? input.icebreakers : undefined,
  };
  const slot = newSlot(theme, input.startsAt);
  slot.curated = true;
  slot.capacity = input.capacity;
  slot.roundSeconds = input.roundSeconds;
  mutate((db) => {
    db.slots[slot.id] = slot;
  });
  return slot;
}

/** 운영진 이벤트 취소: 시작 전인 이벤트만 */
export function cancelEvent(slotId: string): string | null {
  return mutate((db) => {
    const s = db.slots[slotId];
    if (!s) return "이벤트가 없어요.";
    if (s.status !== "open") return "이미 시작했거나 끝난 이벤트예요.";
    s.status = "cancelled";
    s.missed = [...s.applicants];
    s.note = "운영진 사정으로 이벤트가 취소됐어요.";
    return null;
  });
}

/** 예약 초대가 확정되면 그 시간의 세션을 만듭니다. mutate() 안에서 호출하세요. */
export function createConfirmedSlot(db: DB, theme: Theme, startsAt: number, applicants: string[]) {
  const slot = newSlot(theme, startsAt);
  slot.applicants = applicants;
  slot.note = "AI 예약 초대로 확정된 세션이에요.";
  slot.inviteOnly = true;
  db.slots[slot.id] = slot;
  return slot;
}

export async function refreshCatalog() {
  const users = Object.values(readDb().users).filter((u) => u.analysis);
  const { themes, note, source } = await generateCatalog(users);
  mutate((db) => {
    db.catalog = { createdAt: Date.now(), source, note, themes };
    db.catalogCursor = 0;
    // 아직 아무도 신청하지 않은 세션은 새 테마로 바꿔 다시 채웁니다.
    for (const s of Object.values(db.slots)) {
      if (s.status === "open" && s.applicants.length === 0 && !s.inviteOnly && !s.curated) delete db.slots[s.id];
    }
  });
  ensureSlots();
  return { themes, note, source };
}

export function setApplied(userId: string, slotId: string, on: boolean) {
  return mutate((db) => {
    const s = db.slots[slotId];
    if (!s || s.status !== "open") return "이미 마감된 세션이에요.";
    if (s.inviteOnly) return "초대받은 분만 참여할 수 있는 세션이에요.";
    if (on && s.capacity && !s.applicants.includes(userId) && s.applicants.length >= s.capacity) return "정원이 다 찼어요.";
    if (on && !s.applicants.includes(userId) && !canAfford(db, userId, "ticket")) return "입장권이 필요해요. 내 지갑에서 도키를 충전하거나 받을 수 있어요.";
    if (on && !s.applicants.includes(userId)) s.applicants.push(userId);
    if (!on) {
      s.applicants = s.applicants.filter((id) => id !== userId);
      delete s.checkins[userId];
    }
    return null;
  });
}

export function canCheckIn(slot: Slot, now = Date.now()) {
  return slot.status === "open" && now >= slot.startsAt - CHECKIN_OPEN_MS;
}

/** 대기실에 있다는 신호. 대기실 화면이 주기적으로 보냅니다. */
export function checkIn(userId: string, slotId: string) {
  return mutate((db) => {
    const s = db.slots[slotId];
    if (!s) return "세션이 없어요.";
    if (!s.applicants.includes(userId)) return "신청한 세션이 아니에요.";
    if (s.status !== "open") return null;
    if (!canCheckIn(s)) return "아직 입장 시간이 아니에요.";
    s.checkins[userId] = Date.now();
    return null;
  });
}

export function isPresent(slot: Slot, userId: string, at: number) {
  return isPresentIn(readDb(), slot, userId, at);
}

function isPresentIn(db: DB, slot: Slot, userId: string, at: number) {
  const user = db.users[userId];
  if (user?.isDemo) return true; // 데모 참가자는 항상 접속 중으로 봅니다.
  const t = slot.checkins[userId];
  return t !== undefined && t >= at - PRESENCE_MS;
}

// ───────────── 주기 처리: 시작 시간이 된 세션을 그룹으로 ─────────────
//  1) slotsTick (동기): 게시판 채우기, 시작 시간이 된 세션을 'forming'으로 바꾸고 대기실에 있던 사람을 정함
//  2) planSlot (비동기, 읽기만): AI 또는 규칙으로 그룹 나누기
//  3) commitSlot (동기): 그룹을 만들고 입장권을 예치

export interface SlotJob {
  slotId: string;
  presentIds: string[];
}

const FORMING_STUCK_MS = 2 * MIN; // 나누기가 이만큼 끝나지 않으면 규칙으로 바로 나눠요 (서버가 중간에 멈춘 경우)

export function slotsTick(now = Date.now(), skip?: Set<string>): SlotJob[] {
  ensureSlots(now);
  return mutate((db) => {
    const jobs: SlotJob[] = [];
    for (const slot of Object.values(db.slots)) {
      const due = slot.status === "open" && slot.startsAt <= now;
      const stuck = slot.status === "forming" && now - slot.startsAt > FORMING_STUCK_MS && !skip?.has(slot.id);
      if (!due && !stuck) continue;
      if (skip?.has(slot.id)) continue;
      const presentIds = due
        ? slot.applicants.filter((id) => {
            const u = db.users[id];
            return u && u.analysis && u.status !== "grouped" && isPresentIn(db, slot, id, now) && canAfford(db, id, "ticket");
          })
        : (slot.formingIds ?? []);
      slot.status = "forming";
      slot.formingIds = presentIds;
      if (presentIds.length < GROUP_MIN) {
        slot.status = "cancelled";
        slot.missed = [...slot.applicants];
        slot.note = `대기실에 ${presentIds.length}명이 모여 진행하지 못했어요. (최소 ${GROUP_MIN}명)`;
        continue;
      }
      if (stuck) {
        // 멈춘 세션은 AI 없이 규칙으로 바로 나눠요.
        commitSlotIn(db, { slotId: slot.id, presentIds }, { chunks: balancedPack(presentIds.map((id) => db.users[id])).chunks.map((c) => c.map((u) => u.id)), source: "rule" });
        continue;
      }
      jobs.push({ slotId: slot.id, presentIds });
    }
    return jobs;
  });
}

export interface SlotPlan {
  chunks: string[][];
  source: "ai" | "rule";
}

export async function planSlot(db: DB, job: SlotJob): Promise<SlotPlan> {
  const slot = db.slots[job.slotId];
  const present = job.presentIds.map((id) => db.users[id]).filter(Boolean);
  const plan = await splitSession(present, slot.theme);
  return { chunks: plan.chunks.map((c) => c.map((u) => u.id)), source: plan.source };
}

export function commitSlot(job: SlotJob, plan: SlotPlan) {
  mutate((db) => commitSlotIn(db, job, plan));
}

function commitSlotIn(db: DB, job: SlotJob, plan: SlotPlan) {
  const s = db.slots[job.slotId];
  if (!s || s.status !== "forming") return;
  const startAt = Date.now() + COUNTDOWN_MS;
  for (const chunk of plan.chunks) {
    // 그사이 다른 세션에 들어간 사람은 제외
    const members = chunk.filter((id) => db.users[id] && db.users[id].status !== "grouped");
    if (members.length < GROUP_MIN) continue;
    const group = createGroup(db, {
      theme: s.theme,
      memberIds: members,
      reason: `'${s.theme.title}' 테마를 함께 고른 분들이에요.`,
      startInMs: startAt - Date.now(),
      roundSeconds: s.roundSeconds,
    });
    if (group) s.groupIds.push(group.id); // 입장권을 맡기지 못해 성립하지 않으면 건너뛰어요
  }
  const grouped = new Set(s.groupIds.flatMap((gid) => db.groups[gid]?.memberIds ?? []));
  s.missed = s.applicants.filter((id) => !grouped.has(id));
  s.status = s.groupIds.length ? "started" : "cancelled";
  s.formingIds = undefined;
  s.note =
    s.groupIds.length > 0
      ? `${grouped.size}명이 ${s.groupIds.length}개 그룹으로 시작했어요 (${plan.source === "ai" ? "AI" : "규칙 기반"} 분배).`
      : "서로 조건이 맞는 인원이 부족해 진행하지 못했어요.";
}

// Next 앱: 요청이 들어올 때마다 가볍게 호출. 그룹 나누기(AI)는 뒤에서 돌아요.
const g = globalThis as unknown as { __hiroForming?: Set<string> };

export function processDueSlots(now = Date.now()) {
  g.__hiroForming ??= new Set();
  const forming = g.__hiroForming;
  for (const job of slotsTick(now, forming)) {
    forming.add(job.slotId);
    planSlot(readDb(), job)
      .then((plan) => commitSlot(job, plan))
      .catch((err) => console.error("[slots] formSlot failed", err))
      .finally(() => forming.delete(job.slotId));
  }
}
