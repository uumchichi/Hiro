// 테마 세션: 테마 게시판 유지, 신청, 대기실 입장, 시작 시간에 자동으로 그룹 만들기
import { generateCatalog, splitSession } from "./ai";
import { GROUP_MIN, defaultIcebreakers, ruleCatalog } from "./heuristics";
import { buildRotation } from "./rotation";
import { mutate, newId, readDb } from "./store";
import type { Group, Slot, Theme } from "./types";

const MIN = 60_000;
export const CHECKIN_OPEN_MS = Number(process.env.HIRO_CHECKIN_MINUTES ?? 10) * MIN; // 시작 몇 분 전부터 대기실 입장
const PRESENCE_MS = 45_000; // 대기실 신호가 이 시간 안에 있어야 '접속 중'
const SLOT_INTERVAL_MS = Number(process.env.HIRO_SLOT_INTERVAL_MINUTES ?? 60) * MIN;
const UPCOMING = Number(process.env.HIRO_UPCOMING_SLOTS ?? 6); // 게시판에 늘 열려 있는 세션 수
const KEEP_FINISHED_MS = 3 * 60 * MIN;
const ROUND_SECONDS = () => Number(process.env.HIRO_ROUND_SECONDS ?? 300);
const BREAK_SECONDS = () => Number(process.env.HIRO_BREAK_SECONDS ?? 20);
const COUNTDOWN_MS = 15_000; // 그룹이 정해진 뒤 첫 라운드까지

function catalogThemes(): Theme[] {
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
  const open = Object.values(db.slots).filter((s) => s.status === "open" && s.startsAt > now);
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

export async function refreshCatalog() {
  const users = Object.values(readDb().users).filter((u) => u.analysis);
  const { themes, note, source } = await generateCatalog(users);
  mutate((db) => {
    db.catalog = { createdAt: Date.now(), source, note, themes };
    db.catalogCursor = 0;
    // 아직 아무도 신청하지 않은 세션은 새 테마로 바꿔 다시 채웁니다.
    for (const s of Object.values(db.slots)) {
      if (s.status === "open" && s.applicants.length === 0) delete db.slots[s.id];
    }
  });
  ensureSlots();
  return { themes, note, source };
}

export function setApplied(userId: string, slotId: string, on: boolean) {
  return mutate((db) => {
    const s = db.slots[slotId];
    if (!s || s.status !== "open") return "이미 마감된 세션이에요.";
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
  const user = readDb().users[userId];
  if (user?.isDemo) return true; // 데모 참가자는 항상 접속 중으로 봅니다.
  const t = slot.checkins[userId];
  return t !== undefined && t >= at - PRESENCE_MS;
}

const g = globalThis as unknown as { __hiroForming?: Set<string> };

/** 시작 시간이 된 세션을 그룹으로 만듭니다. 요청이 들어올 때마다 가볍게 호출됩니다. */
export function processDueSlots(now = Date.now()) {
  ensureSlots(now);
  g.__hiroForming ??= new Set();
  for (const s of Object.values(readDb().slots)) {
    if (s.status === "open" && s.startsAt <= now && !g.__hiroForming.has(s.id)) {
      g.__hiroForming.add(s.id);
      formSlot(s.id, now)
        .catch((err) => console.error("[slots] formSlot failed", err))
        .finally(() => g.__hiroForming!.delete(s.id));
    }
  }
}

async function formSlot(slotId: string, now: number) {
  const db = readDb();
  const slot = db.slots[slotId];
  const present = slot.applicants
    .map((id) => db.users[id])
    .filter((u) => u && u.analysis && u.status !== "grouped" && isPresent(slot, u.id, now));
  mutate((db) => {
    db.slots[slotId].status = "forming";
  });

  if (present.length < GROUP_MIN) {
    mutate((db) => {
      const s = db.slots[slotId];
      s.status = "cancelled";
      s.missed = [...s.applicants];
      s.note = `대기실에 ${present.length}명이 모여 진행하지 못했어요. (최소 ${GROUP_MIN}명)`;
    });
    return;
  }

  const plan = await splitSession(present, slot.theme);
  mutate((db) => {
    const s = db.slots[slotId];
    const startAt = Date.now() + COUNTDOWN_MS;
    for (const chunk of plan.chunks) {
      // 그사이 다른 세션에 들어간 사람은 제외
      const members = chunk.map((u) => u.id).filter((id) => db.users[id]?.status !== "grouped");
      if (members.length < GROUP_MIN) continue;
      const group: Group = {
        id: newId("g"),
        createdAt: Date.now(),
        theme: s.theme,
        memberIds: members,
        reason: `'${s.theme.title}' 테마를 함께 고른 분들이에요.`,
        icebreakers: s.theme.icebreakers?.length ? s.theme.icebreakers : defaultIcebreakers(s.theme),
        status: "live",
        rounds: buildRotation(members),
        roundSeconds: s.roundSeconds ?? ROUND_SECONDS(),
        breakSeconds: BREAK_SECONDS(),
        startedAt: startAt,
        choices: {},
        submitted: [],
      };
      db.groups[group.id] = group;
      s.groupIds.push(group.id);
      for (const id of members) {
        db.users[id].status = "grouped";
        db.users[id].groupId = group.id;
      }
    }
    const grouped = new Set(s.groupIds.flatMap((gid) => db.groups[gid].memberIds));
    s.missed = s.applicants.filter((id) => !grouped.has(id));
    s.status = s.groupIds.length ? "started" : "cancelled";
    s.note =
      s.groupIds.length > 0
        ? `${grouped.size}명이 ${s.groupIds.length}개 그룹으로 시작했어요 (${plan.source === "ai" ? "AI" : "규칙 기반"} 분배).`
        : "서로 조건이 맞는 인원이 부족해 진행하지 못했어요.";
  });
}
