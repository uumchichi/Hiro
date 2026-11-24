// 상태 화면(내 정보·그룹·로테이션·지갑)과 그룹 마무리. Next 앱과 서버 함수가 함께 써요.
import { env } from "./env.ts";
import { mdpLabel, normalizePrefs, normalizeTraits, tgColor, tgLabel } from "./compat.ts";
import { finishGroup, metPartners } from "./notes.ts";
import { available as walletAvailable } from "./wallet.ts";
import { currentPhase, partnerIn, roomName } from "./rotation.ts";
import { mutate, readDb } from "./world.ts";
import type { Group, User } from "./types.ts";

export function livekitConfigured() {
  return Boolean(env("LIVEKIT_API_KEY") && env("LIVEKIT_API_SECRET") && (env("LIVEKIT_URL") ?? env("NEXT_PUBLIC_LIVEKIT_URL")));
}

/** 끝난 로테이션을 시간에 맞춰 마무리합니다 (live → done, 쪽지 전달, 참가자 풀어 주기). */
export function syncGroupStatus(group: Group) {
  if (group.status === "live" && currentPhase(group).kind === "finished") {
    mutate((db) => {
      const g = db.groups[group.id];
      finishGroup(db, g);
      Object.assign(group, g);
    });
  }
}

/** 로테이션이 끝나서 사용자가 풀려난 뒤에도, 진행 중이던 그룹들을 마무리합니다. */
export function syncAllGroups() {
  for (const g of Object.values(readDb().groups)) if (g.status === "live") syncGroupStatus(g);
}

export function publicMember(u: User | undefined) {
  if (!u) return null;
  return {
    id: u.id,
    code: u.code ?? "",
    nickname: u.profile?.nickname ?? "참가자",
    age: u.profile ? new Date().getFullYear() - u.profile.birthYear + 1 : null,
    region: u.profile?.region ?? "",
    tags: u.profile?.tags ?? [],
    typeName: u.analysis?.typeName ?? "",
    emoji: u.analysis?.emoji ?? "🙂",
    bio: u.profile?.bio ?? "",
    hair: u.matchTraits?.hair ?? null,
    tg: u.matchTraits?.showTg ? tgLabel(u.matchTraits.tg) : null,
    tgColor: u.matchTraits?.showTg ? tgColor(u.matchTraits.tg) : null,
    mdp: u.matchTraits ? mdpLabel(normalizeTraits(u.matchTraits)) : null,
  };
}

export type PublicMember = NonNullable<ReturnType<typeof publicMember>>;

/** 사용자 한 명이 보는 화면 상태. */
export function viewState(userId: string) {
  const db = readDb();
  const user = db.users[userId];
  const now = Date.now();
  let group = null;
  if (user.groupId && db.groups[user.groupId]) {
    const g = db.groups[user.groupId];
    syncGroupStatus(g);
    const phase = currentPhase(g, now);
    const roundIdx = phase.kind === "talk" ? phase.round : phase.kind === "break" ? phase.nextRound : -1;
    const partnerId = roundIdx >= 0 ? partnerIn(g, roundIdx, userId) : null;
    group = {
      id: g.id,
      theme: g.theme,
      reason: g.reason,
      icebreakers: g.icebreakers,
      status: g.status,
      roundCount: g.rounds.length,
      roundSeconds: g.roundSeconds,
      breakSeconds: g.breakSeconds,
      startedAt: g.startedAt ?? null,
      phase,
      members: g.memberIds.map((id) => publicMember(db.users[id])).filter(Boolean) as PublicMember[],
      partner: partnerId ? publicMember(db.users[partnerId]) : null,
      room: phase.kind === "talk" && partnerId ? roomName(g.id, phase.round, userId, partnerId) : null,
      // 지금까지 만난 사람과 내가 쓴 쪽지·메모
      // 이 그룹에서 내가 대화하는 사람 수 (서로 원하는 쌍끼리만 대화해요)
      myPartnerCount: g.rounds.filter((r) => r.pairs.some((p) => p.a === userId || p.b === userId)).length,
      met: metPartners(g, userId, now).map((id) => ({
        member: publicMember(db.users[id]) as PublicMember,
        letter: g.letters[userId]?.[id] ?? "",
        memo: g.memos[userId]?.[id] ?? "",
      })),
    };
  }
  return {
    now,
    user: {
      id: user.id,
      code: user.code ?? "",
      status: user.status,
      profile: user.profile ?? null,
      analysis: user.analysis ?? null,
      matchTraits: user.matchTraits ? normalizeTraits(user.matchTraits) : null,
      partnerWants: user.partnerWants ?? null,
      availability: user.availability ?? [],
      prefs: user.prefs ? normalizePrefs(user.prefs) : null,
    },
    group,
    // 방금 끝난 로테이션의 리포트 (끝나고 1시간 동안 대화방에서 자동으로 이동)
    lastReportId:
      Object.values(db.groups)
        .filter((g) => g.status === "done" && g.memberIds.includes(userId) && now - (g.finishedAt ?? 0) < 3600_000)
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))[0]?.id ?? null,
    voice: { configured: livekitConfigured() },
    wallet: user.wallet
      ? {
          tickets: walletAvailable(db, userId, "ticket"),
          badges: walletAvailable(db, userId, "badge"),
          // 지금 그룹의 입장권: 예치한 것(아직 차감 전)과 사용한 것
          groupTicket: user.groupId
            ? {
                held: Object.keys(user.wallet.holds).filter((r) => r.startsWith(`group:${user.groupId}`)).length,
                used: db.ledger.filter((t) => t.userId === userId && t.kind === "use" && t.ref?.startsWith(`group:${user.groupId}`)).length,
              }
            : null,
        }
      : null,
  };
}

export type ViewState = ReturnType<typeof viewState>;
