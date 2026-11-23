// 서버 공용 도우미: 사용자 쿠키, 운영자 확인, LiveKit 토큰, 화면용 상태 계산
import { cookies, headers } from "next/headers";
import { AccessToken } from "livekit-server-sdk";
import { mutate, newId, readDb } from "./store";
import { mdpLabel, normalizePrefs, normalizeTraits, tgColor, tgLabel } from "./compat";
import { currentPhase, partnerIn, roomName } from "./rotation";
import type { Group, User } from "./types";

const COOKIE = "hiro_uid";

export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  return readDb().users[id] ? id : null;
}

/** 쿠키의 사용자를 가져오고, 없으면 새로 만듭니다. */
export async function ensureUser(): Promise<User> {
  const existing = await currentUserId();
  if (existing) return readDb().users[existing];
  const user: User = { id: newId("u"), createdAt: Date.now(), isDemo: false, status: "new" };
  mutate((db) => {
    db.users[user.id] = user;
  });
  const jar = await cookies();
  jar.set(COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return user;
}

export async function isAdmin(): Promise<boolean> {
  const key = process.env.HIRO_ADMIN_KEY;
  if (!key) return true; // 개발 중에는 키 없이 열림. 배포 시 꼭 설정하세요.
  const h = await headers();
  return h.get("x-admin-key") === key;
}

export function livekitConfigured() {
  return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.NEXT_PUBLIC_LIVEKIT_URL);
}

export async function livekitToken(identity: string, name: string, room: string) {
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: "20m",
  });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return at.toJwt();
}

/** 끝난 세션의 상태를 시간에 맞춰 넘깁니다 (live → choosing). */
export function syncGroupStatus(group: Group) {
  if (group.status === "live" && currentPhase(group).kind === "finished") {
    mutate((db) => {
      const g = db.groups[group.id];
      g.status = "choosing";
      // 데모 참가자는 무작위로 호감을 표시해 혼자서도 결과 화면을 확인할 수 있게 합니다.
      for (const id of g.memberIds) {
        if (!db.users[id]?.isDemo) continue;
        g.choices[id] = g.memberIds.filter((o) => o !== id && Math.random() < 0.6);
        if (!g.submitted.includes(id)) g.submitted.push(id);
      }
      Object.assign(group, g);
    });
  }
}

function publicMember(u: User | undefined) {
  if (!u) return null;
  return {
    id: u.id,
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
    const myChoices = g.choices[userId] ?? [];
    const submitted = g.submitted.includes(userId);
    const mutual = submitted
      ? myChoices.filter((other) => g.submitted.includes(other) && (g.choices[other] ?? []).includes(userId))
      : [];
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
      submitted,
      myChoices,
      waitingFor: g.memberIds.filter((id) => !g.submitted.includes(id)).length,
      mutual: mutual.map((id) => publicMember(db.users[id])).filter(Boolean) as PublicMember[],
    };
  }
  return {
    now,
    user: {
      id: user.id,
      status: user.status,
      profile: user.profile ?? null,
      analysis: user.analysis ?? null,
      matchTraits: user.matchTraits ? normalizeTraits(user.matchTraits) : null,
      partnerWants: user.partnerWants ?? null,
      availability: user.availability ?? [],
      prefs: user.prefs ? normalizePrefs(user.prefs) : null,
    },
    group,
    voice: { configured: livekitConfigured() },
  };
}

export type ViewState = ReturnType<typeof viewState>;
