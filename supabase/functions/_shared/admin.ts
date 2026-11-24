// 운영자 기능: 현황 보기, 데모 참가자, 테스트 세션, 도키·입장권 지급
import { aiEnabled } from "./ai.ts";
import { makeDemoUser } from "./demo.ts";
import { BREAK_SECONDS } from "./groups.ts";
import { GROUP_MAX, GROUP_MIN } from "./heuristics.ts";
import { isOnline } from "./lobby.ts";
import { currentPhase } from "./rotation.ts";
import { createSlotIn, ensureSlots, isPresent } from "./slots.ts";
import { syncGroupStatus } from "./state.ts";
import type { WalletItem } from "./types.ts";
import { livekitConfigured } from "./voice.ts";
import { grant } from "./wallet.ts";
import { mutate, normalizeCode, readDb } from "./world.ts";

/** 데모 참가자를 만들고, 각자 열린 세션 1~2개에 신청시켜요. */
export function seedDemo(count: number) {
  const n = Math.min(40, Math.max(1, Math.floor(count) || 10));
  ensureSlots();
  mutate((db) => {
    const base = Object.values(db.users).filter((u) => u.isDemo).length;
    const open = Object.values(db.slots).filter((s) => s.status === "open");
    for (let i = 0; i < n; i++) {
      const u = makeDemoUser(base + i + 1);
      db.users[u.id] = u;
      const picks = [...open].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
      for (const s of picks) s.applicants.push(u.id);
    }
  });
  return n;
}

/** 데모 참가자를 만들어 대기실에 넣어요. */
export function seedLobby(count: number) {
  mutate((db) => {
    const base = Object.values(db.users).filter((u) => u.isDemo).length;
    for (let i = 0; i < count; i++) {
      const u = makeDemoUser(base + i + 1);
      db.users[u.id] = u;
      db.lobby[u.id] = { joinedAt: Date.now(), lastSeen: Date.now(), interests: [], priority: 0 };
    }
  });
  return count;
}

/** 테스트 세션 만들기. demo면 그룹에 없는 데모 참가자를 모두 신청시켜요. */
export function createTestSlot(minutes: number, roundSeconds?: number, demo?: boolean) {
  const slot = createSlotIn(minutes, roundSeconds);
  if (demo) {
    mutate((db) => {
      const s = db.slots[slot.id];
      for (const u of Object.values(db.users)) if (u.isDemo && u.status !== "grouped") s.applicants.push(u.id);
    });
  }
  return slot.id;
}

export function startSlotNow(slotId: string): string | null {
  return mutate((db) => {
    if (!db.slots[slotId]) return "세션이 없어요.";
    db.slots[slotId].startsAt = Date.now();
    return null;
  });
}

/** 공개 ID로 도키·입장권·직진러의 증표 지급 */
export function grantByCode(rawCode: string, item: WalletItem, amount: number, note: string): { error?: string; status?: number; note?: string } {
  const code = normalizeCode(rawCode);
  const user = Object.values(readDb().users).find((u) => u.code === code);
  if (!user) return { error: "해당 ID의 사용자를 찾을 수 없어요.", status: 404 };
  if (user.isDemo) return { error: "데모 참가자에게는 지급할 수 없어요.", status: 400 };
  grant(user.id, item, amount, note || "운영자 지급");
  const name = { doki: "도키", ticket: "입장권", badge: "직진러의 증표" }[item];
  return { note: `${user.profile?.nickname ?? "사용자"} #${code}에게 ${name} ${amount}개를 지급했어요.` };
}

export function adminOverview(now = Date.now()) {
  const db = readDb();
  const users = Object.values(db.users);
  const name = (id: string) => `${db.users[id]?.profile?.nickname ?? "참가자"} #${db.users[id]?.code ?? "?"}`;
  const groups = Object.values(db.groups)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((g) => {
      syncGroupStatus(g);
      return {
        id: g.id,
        theme: g.theme,
        status: g.status,
        members: g.memberIds.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo })),
        roundCount: g.rounds.length,
        roundSeconds: g.roundSeconds,
        phase: currentPhase(g),
        letters: Object.values(g.letters).reduce((n, m) => n + Object.keys(m).length, 0),
      };
    });
  const slots = Object.values(db.slots)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((s) => ({
      id: s.id,
      theme: s.theme,
      startsAt: s.startsAt,
      status: s.status,
      curated: Boolean(s.curated),
      capacity: s.capacity ?? null,
      roundSeconds: s.roundSeconds ?? null,
      applicants: s.applicants.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo, present: isPresent(s, id, now) })),
      note: s.note ?? null,
    }));
  return {
    now,
    config: { ai: aiEnabled(), voice: livekitConfigured(), groupMin: GROUP_MIN, groupMax: GROUP_MAX, breakSeconds: BREAK_SECONDS() },
    counts: {
      total: users.length,
      real: users.filter((u) => !u.isDemo).length,
      demo: users.filter((u) => u.isDemo).length,
      grouped: users.filter((u) => u.status === "grouped").length,
    },
    catalog: db.catalog ? { source: db.catalog.source, note: db.catalog.note, createdAt: db.catalog.createdAt, count: db.catalog.themes.length } : null,
    slots,
    groups,
    reports: [...db.reports]
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        at: r.at,
        target: r.targetId ? name(r.targetId) : `#${r.targetCode}`,
        reporter: name(r.reporterId),
        reason: r.reason,
        detail: r.detail,
        context: r.context,
        status: r.status,
        targetReports: db.reports.filter((x) => x.targetCode === r.targetCode).length,
      })),
    lobby: Object.entries(db.lobby)
      .map(([id, e]) => ({
        id,
        nickname: name(id),
        demo: !!db.users[id]?.isDemo,
        online: isOnline(db, id, now),
        priority: e.priority,
        waitedSec: Math.round((now - e.joinedAt) / 1000),
        interests: e.interests.length,
      }))
      .sort((a, b) => b.waitedSec - a.waitedSec),
    invites: Object.values(db.invites)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        startsAt: i.startsAt ?? null,
        theme: i.theme,
        status: i.status,
        source: i.source,
        expiresAt: i.expiresAt,
        invitees: i.invitees.map((id) => ({
          nickname: name(id),
          state: i.accepted.includes(id) ? "accepted" : i.declined.includes(id) ? "declined" : "pending",
        })),
      })),
  };
}
