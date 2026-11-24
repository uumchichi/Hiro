// 쪽지 · 메모 · 쪽지의 주인 찾기 · 24시간 채팅방
import { currentPhase, partnerIn } from "./rotation";
import { TICKET_AFTER_MS, available, canAfford, consume, hold, release, releasePrefix } from "./wallet";
import { mutate, newId, readDb } from "./store";
import type { Chat, DB, Group } from "./types";

export const LETTER_MAX = 300;
export const MEMO_MAX = 500;
export const CHAT_TTL_MS = 24 * 3600_000;
const REPORT_KEEP_MS = 30 * 24 * 3600_000; // 리포트는 30일 동안 볼 수 있어요

/** 지금까지(현재 라운드 포함) 1:1로 만난 사람들, 만난 순서대로 */
export function metPartners(group: Group, userId: string, now = Date.now()): string[] {
  const phase = currentPhase(group, now);
  const upto =
    phase.kind === "finished" || group.status === "done"
      ? group.rounds.length - 1
      : phase.kind === "talk"
        ? phase.round
        : phase.kind === "break"
          ? phase.nextRound - 1
          : -1;
  const out: string[] = [];
  for (let r = 0; r <= upto; r++) {
    const p = partnerIn(group, r, userId);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** 쪽지·메모 저장. 만난 사람에게만, 로테이션이 끝나기 전까지만 쓸 수 있어요. */
export function saveNote(userId: string, groupId: string, to: string, patch: { letter?: string; memo?: string }): string | null {
  return mutate((db) => {
    const g = db.groups[groupId];
    if (!g || !g.memberIds.includes(userId)) return "참여한 그룹이 아니에요.";
    if (!metPartners(g, userId).includes(to)) return "대화한 분에게만 쓸 수 있어요.";
    if (patch.letter !== undefined) {
      if (g.status === "done") return "로테이션이 끝나서 쪽지는 더 이상 고칠 수 없어요.";
      g.letters[userId] ??= {};
      const text = patch.letter.trim().slice(0, LETTER_MAX);
      if (text) g.letters[userId][to] = text;
      else delete g.letters[userId][to];
    }
    if (patch.memo !== undefined) {
      // 메모는 나만 보는 기록이라 끝난 뒤에도 고칠 수 있어요.
      g.memos[userId] ??= {};
      const text = patch.memo.trim().slice(0, MEMO_MAX);
      if (text) g.memos[userId][to] = text;
      else delete g.memos[userId][to];
    }
    return null;
  });
}

const DEMO_LETTERS = [
  "목소리가 정말 편안했어요. 다음에 또 이야기 나누고 싶어요 :)",
  "고양이 이야기 더 듣고 싶어요! 커피 한잔 어떠세요?",
  "대화가 너무 짧게 느껴졌어요. 애프터 신청합니다 ☕",
  "웃음소리가 기억에 남아요. 또 만나면 좋겠어요.",
  "취향이 많이 겹쳐서 신기했어요. 다음에 전시 같이 보러 가요!",
];

/** 로테이션이 끝나면: 그룹 종료, 참가자 풀어 주기, 데모 참가자의 쪽지·주인 찾기 */
export function finishGroup(db: DB, g: Group) {
  if (g.status === "done") return;
  g.status = "done";
  g.finishedAt = Date.now();
  // 1:1 대화가 한 번도 성사되지 않은 사람의 입장권은 돌려줘요.
  // 성사되지 않은 1:1 대화 몫의 입장권은 모두 돌려줘요.
  for (const id of g.memberIds) releasePrefix(db, id, `group:${g.id}`, (n) => `'${g.theme.title}' 성사되지 않은 대화 ${n}번 몫의 입장권을 돌려드렸어요`);
  for (const id of g.memberIds) {
    const u = db.users[id];
    if (u && u.groupId === g.id) {
      u.status = u.analysis ? "analyzed" : "profiled";
      u.groupId = undefined;
    }
  }
  // 데모: 만난 사람 일부에게 쪽지를 쓰고, 받은 쪽지 중 하나의 주인을 찾습니다.
  const demos = g.memberIds.filter((id) => db.users[id]?.isDemo);
  for (const id of demos) {
    for (const to of metPartners(g, id)) {
      if (Math.random() < 0.55) {
        g.letters[id] ??= {};
        g.letters[id][to] = DEMO_LETTERS[Math.floor(Math.random() * DEMO_LETTERS.length)];
      }
    }
  }
  for (const id of demos) {
    const senders = Object.keys(g.letters).filter((from) => g.letters[from]?.[id]);
    if (!senders.length || Math.random() < 0.2) continue;
    // 실제 사용자가 보낸 쪽지가 있으면 그쪽을 더 자주 골라서, 혼자서도 매칭을 시험해 볼 수 있게 합니다.
    const real = senders.filter((s) => !db.users[s]?.isDemo);
    const pick = real.length && Math.random() < 0.75 ? real[0] : senders[Math.floor(Math.random() * senders.length)];
    g.reveals[id] = pick;
  }
  // 데모: 주인 찾기로 매칭되지 않았고 실제 사용자에게 쪽지를 썼다면 가끔 직진도 보내요 (받는 쪽 화면을 시험해 볼 수 있게)
  g.straights ??= {};
  for (const id of demos) {
    const realTo = Object.keys(g.letters[id] ?? {}).find((to) => !db.users[to]?.isDemo);
    // 실제 사용자의 쪽지 주인을 찾았다면 매칭될 수도 있으니 직진하지 않아요.
    if (!realTo || g.reveals[id] === realTo || straightStage(db, g, id) !== "open" || Math.random() >= 0.4) continue;
    const now = Date.now();
    g.straights[id] = { to: realTo, message: "쪽지로는 부족해서 직진해요! 이야기 더 나눠요 :)", at: now, expiresAt: now + STRAIGHT_TTL_MS, status: "pending" };
  }
}

/** 쪽지의 주인 찾기: 한 사람당 단 한 번. 서로 찾았으면 채팅방이 열려요. */
export function revealOwner(userId: string, groupId: string, letterIndex: number): { error?: string; chatId?: string } {
  return mutate((db) => {
    const g = db.groups[groupId];
    if (!g || !g.memberIds.includes(userId)) return { error: "참여한 그룹이 아니에요." };
    if (g.status !== "done") return { error: "로테이션이 끝난 뒤에 할 수 있어요." };
    if (g.reveals[userId]) return { error: "쪽지의 주인 찾기는 한 번만 할 수 있어요." };
    const senders = receivedOrder(g, userId);
    const from = senders[letterIndex];
    if (!from) return { error: "쪽지를 찾을 수 없어요." };
    g.reveals[userId] = from;
    const chatId = ensureChatIfMutual(db, g, userId);
    return { chatId: chatId ?? undefined };
  });
}

/** 받은 쪽지의 순서 (보낸 사람을 드러내지 않도록 그룹·사용자마다 섞인 고정 순서) */
function receivedOrder(g: Group, userId: string) {
  const senders = Object.keys(g.letters).filter((from) => g.letters[from]?.[userId]);
  const key = (s: string) => {
    let h = 0;
    for (const c of g.id + userId + s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return h;
  };
  return senders.sort((a, b) => key(a) - key(b));
}

function findChat(db: DB, groupId: string, a: string, b: string) {
  return Object.values(db.chats).find((c) => c.groupId === groupId && c.members.includes(a) && c.members.includes(b));
}

function openChat(db: DB, groupId: string, a: string, b: string, origin: Chat["origin"]): string {
  const existing = findChat(db, groupId, a, b);
  if (existing) return existing.id;
  const now = Date.now();
  const chat: Chat = { id: newId("chat"), groupId, members: [a, b], origin, createdAt: now, expiresAt: now + CHAT_TTL_MS, messages: [] };
  db.chats[chat.id] = chat;
  return chat.id;
}

function ensureChatIfMutual(db: DB, g: Group, userId: string): string | null {
  const other = g.reveals[userId];
  if (!other || g.reveals[other] !== userId) return null;
  return openChat(db, g.id, userId, other, "mutual");
}

// ───────────── 직진하기 ─────────────
// 매칭에 실패한 뒤의 마지막 기회예요. 쪽지 보내기와 쪽지 주인 찾기가 끝났는데 서로 지목이 안 됐으면
// (받은 쪽지가 없어서 주인 찾기를 못 하는 경우 포함) 쪽지를 보낸 사람 중 1명에게 채팅을 신청할 수 있어요.
// 받은 사람이 수락하면 24시간 채팅방이 열려요. 거절·무응답은 보낸 사람에게 구분하지 않고 알려요.

export const STRAIGHT_TTL_MS = 24 * 3600_000;
export const STRAIGHT_MESSAGE_MAX = 100;

export type StraightStage = "rotation" | "need_reveal" | "matched" | "open" | "used";

/** 지금 직진할 수 있는 단계인지 */
function straightStage(db: DB, g: Group, userId: string): StraightStage {
  if (g.status !== "done") return "rotation";
  if (g.straights?.[userId]) return "used";
  const revealed = g.reveals[userId];
  if (revealed && g.reveals[revealed] === userId) return "matched";
  const received = Object.keys(g.letters).some((from) => g.letters[from]?.[userId]);
  if (received && !revealed) return "need_reveal";
  return "open";
}

function straightCandidates(db: DB, g: Group, userId: string) {
  return Object.keys(g.letters[userId] ?? {}).filter((to) => !findChat(db, g.id, userId, to));
}

export function sendStraight(userId: string, groupId: string, to: string, message: string): string | null {
  return mutate((db) => {
    const g = db.groups[groupId];
    if (!g || !g.memberIds.includes(userId)) return "참여한 그룹이 아니에요.";
    const stage = straightStage(db, g, userId);
    if (stage === "rotation") return "로테이션이 끝난 뒤에 할 수 있어요.";
    if (stage === "used") return "이번 로테이션의 직진은 이미 사용했어요.";
    if (stage === "need_reveal") return "쪽지 주인 찾기를 먼저 해 주세요.";
    if (stage === "matched") return "이미 매칭된 분이 있어요.";
    g.straights ??= {};
    if (!g.letters[userId]?.[to]) return "쪽지를 보낸 분에게만 직진할 수 있어요.";
    if (findChat(db, g.id, userId, to)) return "이미 채팅방이 열려 있어요.";
    // 직진러의 증표는 맡아 두고, 상대가 수락하면 차감해요.
    if (!hold(db, userId, "badge", `straight:${g.id}`, "직진러의 증표 맡김")) return "직진러의 증표가 필요해요.";
    const now = Date.now();
    g.straights[userId] = {
      to,
      message: message.trim().slice(0, STRAIGHT_MESSAGE_MAX),
      at: now,
      expiresAt: now + STRAIGHT_TTL_MS,
      status: "pending",
      demoReply: db.users[to]?.isDemo ? { at: now + 4_000 + Math.random() * 8_000, accept: Math.random() < 0.7 } : undefined,
    };
    return null;
  });
}

export function respondStraight(userId: string, groupId: string, from: string, accept: boolean): { error?: string; chatId?: string } {
  return mutate((db) => {
    const st = db.groups[groupId]?.straights?.[from];
    if (!st || st.to !== userId) return { error: "직진 신청을 찾을 수 없어요." };
    if (st.status !== "pending") return { error: "이미 응답했거나 시간이 지났어요." };
    if (Date.now() > st.expiresAt) {
      st.status = "expired";
      release(db, from, `straight:${groupId}`, "직진이 이어지지 않아 증표를 돌려드렸어요");
      return { error: "24시간이 지나 신청이 만료됐어요." };
    }
    if (!accept) {
      st.status = "declined";
      release(db, from, `straight:${groupId}`, "직진이 이어지지 않아 증표를 돌려드렸어요");
      return {};
    }
    st.status = "accepted";
    consume(db, from, `straight:${groupId}`, "직진이 수락돼 증표 사용");
    st.chatId = openChat(db, groupId, from, userId, "straight");
    return { chatId: st.chatId };
  });
}

/** 직진 만료와 데모 자동 응답 */
export function processStraights(now = Date.now()) {
  const db = readDb();
  const due = Object.values(db.groups).some((g) =>
    Object.values(g.straights ?? {}).some((st) => st.status === "pending" && (now > st.expiresAt || (st.demoReply && now >= st.demoReply.at))),
  );
  if (!due) return;
  mutate((db) => {
    for (const g of Object.values(db.groups)) {
      for (const [from, st] of Object.entries(g.straights ?? {})) {
        if (st.status !== "pending") continue;
        const ref = `straight:${g.id}`;
        if (now > st.expiresAt) {
          st.status = "expired";
          release(db, from, ref, "직진이 이어지지 않아 증표를 돌려드렸어요");
        } else if (st.demoReply && now >= st.demoReply.at) {
          if (st.demoReply.accept) {
            st.status = "accepted";
            consume(db, from, ref, "직진이 수락돼 증표 사용");
            st.chatId = openChat(db, g.id, from, st.to, "straight");
          } else {
            st.status = "declined";
            release(db, from, ref, "직진이 이어지지 않아 증표를 돌려드렸어요");
          }
        }
      }
    }
  });
}

/** 데모가 먼저 나를 지목해 둔 경우에도, 내가 지목하는 순간 위에서 채팅방이 열려요. 시간이 지난 채팅방은 내용과 함께 지웁니다. */
export function purgeExpired(now = Date.now()) {
  processStraights(now);
  const db = readDb();
  const expired = Object.values(db.chats).filter((c) => c.expiresAt <= now);
  const oldGroups = Object.values(db.groups).filter((g) => g.status === "done" && g.finishedAt && now - g.finishedAt > REPORT_KEEP_MS);
  if (!expired.length && !oldGroups.length) return;
  mutate((db) => {
    for (const c of expired) delete db.chats[c.id];
    for (const g of oldGroups) delete db.groups[g.id];
  });
}

// ───────────── 입장권: 1:1 대화 성사 확인 ─────────────

/**
 * 대화방 화면이 보내는 '여기 있어요' 신호를 기록하고, 지금 라운드의 1:1 대화가
 * 두 사람 모두 접속한 채로 일정 시간(기본 30초) 이어졌으면 두 사람의 입장권을 차감해요.
 * (데모 참가자는 항상 접속 중으로 봐요. 실제 음성 연결 확인은 LiveKit 웹훅으로 더 정확하게 바꿀 수 있어요.)
 */
export function recordPresence(userId: string, now = Date.now()) {
  const db = readDb();
  const u = db.users[userId];
  const g = u?.groupId ? db.groups[u.groupId] : undefined;
  if (!g || g.status !== "live") return;
  const phase = currentPhase(g, now);
  if (phase.kind !== "talk") return;
  const partner = partnerIn(g, phase.round, userId);
  if (!partner) return;
  const roundStart = phase.endsAt - g.roundSeconds * 1000;
  mutate((db) => {
    const grp = db.groups[g.id];
    grp.presence ??= {};
    const r = (grp.presence[phase.round] ??= {});
    const me = (r[userId] ??= { first: now, last: now });
    me.last = now;
    const other = db.users[partner]?.isDemo ? { first: roundStart, last: now } : r[partner];
    if (!other || now - other.last > 15_000) return;
    const since = Math.max(me.first, other.first, roundStart);
    if (now - since < TICKET_AFTER_MS()) return;
    // 이 상대와의 대화 몫 1장씩 (예전 방식으로 맡긴 group:그룹 한 장도 함께 처리)
    const myName = db.users[userId]?.profile?.nickname ?? "상대";
    const theirName = db.users[partner]?.profile?.nickname ?? "상대";
    if (!consume(db, userId, `group:${grp.id}:${partner}`, `'${grp.theme.title}' ${theirName}님과 대화가 성사돼 입장권 사용`)) {
      consume(db, userId, `group:${grp.id}`, `'${grp.theme.title}' 1:1 대화가 성사돼 입장권 사용`);
    }
    if (!consume(db, partner, `group:${grp.id}:${userId}`, `'${grp.theme.title}' ${myName}님과 대화가 성사돼 입장권 사용`)) {
      consume(db, partner, `group:${grp.id}`, `'${grp.theme.title}' 1:1 대화가 성사돼 입장권 사용`);
    }
  });
}

// ───────────── 화면용 ─────────────

export function reportView(userId: string, groupId: string, publicMember: (id: string) => unknown) {
  purgeExpired();
  const db = readDb();
  const g = db.groups[groupId];
  if (!g || !g.memberIds.includes(userId)) return null;
  const done = g.status === "done";
  const met = metPartners(g, userId);
  const order = receivedOrder(g, userId);
  const revealed = g.reveals[userId] ?? null;
  const chat = revealed
    ? Object.values(db.chats).find((c) => c.groupId === g.id && c.members.includes(userId) && c.members.includes(revealed))
    : undefined;
  return {
    id: g.id,
    theme: { title: g.theme.title, emoji: g.theme.emoji },
    startedAt: g.startedAt ?? g.createdAt,
    done,
    // 받은 쪽지는 로테이션이 끝난 뒤에만 보여요. 보낸 사람은 주인 찾기를 한 쪽지만 드러납니다.
    received: done
      ? order.map((from, i) => ({
          index: i,
          text: g.letters[from][userId],
          owner: revealed === from ? publicMember(from) : null,
        }))
      : [],
    receivedCount: done ? order.length : null,
    revealedIndex: revealed ? order.indexOf(revealed) : null,
    mutual: Boolean(revealed && g.reveals[revealed] === userId),
    chat: chat ? { id: chat.id, expiresAt: chat.expiresAt } : null,
    // 직진하기
    straight: (() => {
      const mine = g.straights?.[userId];
      const sentStatus = mine ? (mine.status === "pending" ? "pending" : mine.status === "accepted" ? "accepted" : "missed") : null;
      return {
        // 보낸 사람에게는 거절과 만료를 구분하지 않아요
        sent: mine ? { to: publicMember(mine.to), message: mine.message, status: sentStatus, chatId: mine.chatId ?? null } : null,
        stage: straightStage(db, g, userId),
        badges: available(db, userId, "badge"),
        canStraight: canAfford(db, userId, "badge"), // 증표가 없어도 자동 교환할 도키가 있으면 true
        candidates: straightStage(db, g, userId) === "open" ? straightCandidates(db, g, userId).map((id) => publicMember(id)) : [],
        received: Object.entries(g.straights ?? {})
          .filter(([, st]) => st.to === userId)
          .map(([from, st]) => ({
            from: publicMember(from),
            fromId: from,
            letter: g.letters[from]?.[userId] ?? "",
            message: st.message,
            status: st.status,
            expiresAt: st.expiresAt,
            chatId: st.chatId ?? null,
          })),
      };
    })(),
    // 내가 보낸 쪽지와 내 메모: 만난 사람별로 한눈에
    people: met.map((id) => ({
      member: publicMember(id),
      letter: g.letters[userId]?.[id] ?? "",
      memo: g.memos[userId]?.[id] ?? "",
    })),
  };
}

export function myRecords(userId: string, publicMember: (id: string) => unknown) {
  purgeExpired();
  const db = readDb();
  const now = Date.now();
  const groups = Object.values(db.groups)
    .filter((g) => g.memberIds.includes(userId) && g.status === "done")
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .map((g) => ({
      id: g.id,
      theme: { title: g.theme.title, emoji: g.theme.emoji },
      finishedAt: g.finishedAt ?? g.createdAt,
      received: Object.keys(g.letters).filter((from) => g.letters[from]?.[userId]).length,
      revealed: Boolean(g.reveals[userId]),
    }));
  const chats = Object.values(db.chats)
    .filter((c) => c.members.includes(userId) && c.expiresAt > now)
    .map((c) => {
      const other = c.members.find((m) => m !== userId)!;
      const last = c.messages[c.messages.length - 1];
      return { id: c.id, other: publicMember(other), expiresAt: c.expiresAt, last: last ? { text: last.text, mine: last.from === userId } : null };
    });
  const straights = Object.values(db.groups).flatMap((g) =>
    Object.entries(g.straights ?? {})
      .filter(([, st]) => st.to === userId && st.status === "pending")
      .map(([from, st]) => ({ groupId: g.id, from: publicMember(from), message: st.message, expiresAt: st.expiresAt })),
  );
  return { now, groups, chats, straights };
}

export function chatView(userId: string, chatId: string, publicMember: (id: string) => unknown) {
  purgeExpired();
  const c = readDb().chats[chatId];
  if (!c || !c.members.includes(userId)) return null;
  const other = c.members.find((m) => m !== userId)!;
  return {
    now: Date.now(),
    id: c.id,
    expiresAt: c.expiresAt,
    other: publicMember(other),
    messages: c.messages.map((m) => ({ id: m.id, text: m.text, at: m.at, mine: m.from === userId })),
  };
}

export function sendMessage(userId: string, chatId: string, text: string): string | null {
  return mutate((db) => {
    const c = db.chats[chatId];
    if (!c || !c.members.includes(userId)) return "채팅방을 찾을 수 없어요.";
    if (c.expiresAt <= Date.now()) return "24시간이 지나 채팅방이 닫혔어요.";
    const t = text.trim().slice(0, 1000);
    if (!t) return null;
    c.messages.push({ id: newId("m"), from: userId, text: t, at: Date.now() });
    return null;
  });
}
