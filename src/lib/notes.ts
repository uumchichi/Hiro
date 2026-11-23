// 쪽지 · 메모 · 쪽지의 주인 찾기 · 24시간 채팅방
import { currentPhase, partnerIn } from "./rotation";
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

function ensureChatIfMutual(db: DB, g: Group, userId: string): string | null {
  const other = g.reveals[userId];
  if (!other || g.reveals[other] !== userId) return null;
  const existing = Object.values(db.chats).find((c) => c.groupId === g.id && c.members.includes(userId) && c.members.includes(other));
  if (existing) return existing.id;
  const now = Date.now();
  const chat: Chat = { id: newId("chat"), groupId: g.id, members: [userId, other], createdAt: now, expiresAt: now + CHAT_TTL_MS, messages: [] };
  db.chats[chat.id] = chat;
  return chat.id;
}

/** 데모가 먼저 나를 지목해 둔 경우에도, 내가 지목하는 순간 위에서 채팅방이 열려요. 시간이 지난 채팅방은 내용과 함께 지웁니다. */
export function purgeExpired(now = Date.now()) {
  const db = readDb();
  const expired = Object.values(db.chats).filter((c) => c.expiresAt <= now);
  const oldGroups = Object.values(db.groups).filter((g) => g.status === "done" && g.finishedAt && now - g.finishedAt > REPORT_KEEP_MS);
  if (!expired.length && !oldGroups.length) return;
  mutate((db) => {
    for (const c of expired) delete db.chats[c.id];
    for (const g of oldGroups) delete db.groups[g.id];
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
  return { now, groups, chats };
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
