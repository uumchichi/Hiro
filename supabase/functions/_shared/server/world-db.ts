// DB 테이블 ↔ 도메인 로직의 DB 객체.
// loadWorld로 불러와 도메인 로직(runWithWorld)을 돌리고, saveWorld로 바뀐 부분만 저장해요.
// 반드시 tx() 안에서 쓰세요: tx()가 전역 잠금을 잡아서, 불러온 뒤 저장할 때까지 다른 요청이 끼어들지 못해요.
import type {
  Chat,
  DB,
  Group,
  Invite,
  LobbyEntry,
  Slot,
  Straight,
  User,
  UserReport,
  Wallet,
} from "../types.ts";
import { emptyDb } from "../world.ts";
import type { Sql, Tx } from "./db.ts";
import { type UserRow, toUser } from "./users.ts";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : undefined);
const ts = (n: number | undefined | null) => (n === undefined || n === null ? null : new Date(n));

/** 저장할 때 무엇이 바뀌었는지 비교하려고, 불러온 순간의 모습을 JSON으로 기억해 둬요. */
export interface Loaded {
  db: DB;
  snap: {
    users: Map<string, string>;
    wallets: Map<string, string>;
    lobby: Map<string, string>;
    invites: Map<string, string>;
    slots: Map<string, string>;
    applied: Map<string, number>; // slot_id/user_id → applied_at
    groups: Map<string, string>;
    chats: Map<string, string>;
    messages: Map<string, Set<string>>;
    reports: Map<string, string>;
    catalog: string;
    ticks: string;
  };
}

const key = (v: unknown) => JSON.stringify(v ?? null);

export async function loadWorld(t: Tx | Sql): Promise<Loaded> {
  const db = emptyDb();
  const [users, wallets, holds, lobby, invites, slots, applicants, catalog, groups, presence, letters, memos, reveals, straights, chats, messages, reports, ticks] =
    await Promise.all([
      t<UserRow[]>`select * from users`,
      t<Row[]>`select * from wallets`,
      t<Row[]>`select * from wallet_holds order by at`,
      t<Row[]>`select * from lobby`,
      t<Row[]>`select * from invites`,
      t<Row[]>`select * from slots`,
      t<Row[]>`select * from slot_applicants order by applied_at, user_id`,
      t<Row[]>`select * from theme_catalog where id = 1`,
      t<Row[]>`select * from groups`,
      t<Row[]>`select * from presence`,
      t<Row[]>`select * from letters`,
      t<Row[]>`select * from memos`,
      t<Row[]>`select * from reveals`,
      t<Row[]>`select * from straights`,
      t<Row[]>`select * from chats`,
      t<Row[]>`select * from chat_messages order by at, id`,
      t<Row[]>`select * from reports order by at`,
      t<Row[]>`select * from ticks`,
    ]);

  for (const r of users) db.users[r.id] = toUser(r);
  for (const w of wallets) {
    const u = db.users[w.user_id];
    if (!u) continue;
    u.wallet = { freeDoki: w.free_doki, paidDoki: w.paid_doki, tickets: w.tickets, badges: w.badges, holds: {}, autoExchange: w.auto_exchange };
  }
  for (const h of holds) {
    const w = db.users[h.user_id]?.wallet;
    if (w) w.holds[h.ref] = { item: h.item, at: ms(h.at)! };
  }
  for (const l of lobby) {
    db.lobby[l.user_id] = {
      joinedAt: ms(l.joined_at)!,
      lastSeen: ms(l.last_seen) ?? 0,
      interests: l.interests ?? [],
      priority: l.priority,
      note: l.note ?? undefined,
    };
  }
  for (const i of invites) {
    db.invites[i.id] = {
      id: i.id,
      kind: i.kind,
      createdAt: ms(i.created_at)!,
      expiresAt: ms(i.expires_at)!,
      startsAt: ms(i.starts_at),
      theme: i.theme,
      invitees: i.invitees,
      accepted: i.accepted,
      declined: i.declined,
      status: i.status,
      groupId: i.group_id ?? undefined,
      slotId: i.slot_id ?? undefined,
      source: i.source,
      demoPlan: i.demo_plan ?? undefined,
    };
  }
  const applied = new Map<string, number>();
  for (const s of slots) {
    db.slots[s.id] = {
      id: s.id,
      createdAt: ms(s.created_at)!,
      theme: s.theme,
      startsAt: ms(s.starts_at)!,
      status: s.status,
      applicants: [],
      checkins: {},
      groupIds: s.group_ids ?? [],
      missed: s.missed ?? [],
      roundSeconds: s.round_seconds ?? undefined,
      inviteOnly: s.invite_only || undefined,
      curated: s.curated || undefined,
      capacity: s.capacity ?? undefined,
      note: s.note ?? undefined,
      formingIds: s.forming_ids ?? undefined,
    };
  }
  for (const a of applicants) {
    const s = db.slots[a.slot_id];
    if (!s) continue;
    s.applicants.push(a.user_id);
    if (a.checkin_at) s.checkins[a.user_id] = ms(a.checkin_at)!;
    applied.set(`${a.slot_id}/${a.user_id}`, ms(a.applied_at)!);
  }
  if (catalog[0]) {
    db.catalog = { createdAt: ms(catalog[0].created_at)!, source: catalog[0].source, note: catalog[0].note, themes: catalog[0].themes };
    db.catalogCursor = catalog[0].cursor;
  }
  for (const g of groups) {
    db.groups[g.id] = {
      id: g.id,
      createdAt: ms(g.created_at)!,
      theme: g.theme,
      memberIds: g.member_ids,
      reason: g.reason,
      icebreakers: g.icebreakers ?? [],
      status: g.status,
      rounds: g.rounds,
      roundSeconds: g.round_seconds,
      breakSeconds: g.break_seconds,
      startedAt: ms(g.started_at),
      finishedAt: ms(g.finished_at),
      letters: {},
      memos: {},
      reveals: {},
    };
  }
  for (const p of presence) {
    const g = db.groups[p.group_id];
    if (!g) continue;
    g.presence ??= {};
    (g.presence[p.round] ??= {})[p.user_id] = { first: ms(p.first_at)!, last: ms(p.last_at)! };
  }
  for (const l of letters) {
    const g = db.groups[l.group_id];
    if (g) (g.letters[l.from_id] ??= {})[l.to_id] = l.text;
  }
  for (const m of memos) {
    const g = db.groups[m.group_id];
    if (g) (g.memos[m.from_id] ??= {})[m.to_id] = m.text;
  }
  for (const r of reveals) {
    const g = db.groups[r.group_id];
    if (g) g.reveals[r.user_id] = r.from_id;
  }
  for (const s of straights) {
    const g = db.groups[s.group_id];
    if (!g) continue;
    g.straights ??= {};
    g.straights[s.from_id] = {
      to: s.to_id,
      message: s.message,
      at: ms(s.at)!,
      expiresAt: ms(s.expires_at)!,
      status: s.status,
      chatId: s.chat_id ?? undefined,
      demoReply: s.demo_reply ?? undefined,
    };
  }
  const msgIds = new Map<string, Set<string>>();
  for (const c of chats) {
    db.chats[c.id] = {
      id: c.id,
      groupId: c.group_id,
      members: c.members as [string, string],
      origin: c.origin,
      createdAt: ms(c.created_at)!,
      expiresAt: ms(c.expires_at)!,
      messages: [],
    };
    msgIds.set(c.id, new Set());
  }
  for (const m of messages) {
    const c = db.chats[m.chat_id];
    if (!c) continue;
    c.messages.push({ id: m.id, from: m.from_id, text: m.text, at: ms(m.at)! });
    msgIds.get(m.chat_id)!.add(m.id);
  }
  for (const r of reports) {
    db.reports.push({
      id: r.id,
      at: ms(r.at)!,
      reporterId: r.reporter_id,
      targetCode: r.target_code,
      targetId: r.target_id,
      reason: r.reason,
      detail: r.detail,
      context: r.context,
      status: r.status,
    });
  }
  db.ticks = Object.fromEntries(ticks.map((x) => [x.key, ms(x.at)!]));

  const snap: Loaded["snap"] = {
    users: new Map(Object.values(db.users).map((u) => [u.id, key(userCols(u))])),
    wallets: new Map(Object.values(db.users).filter((u) => u.wallet).map((u) => [u.id, key(u.wallet)])),
    lobby: new Map(Object.entries(db.lobby).map(([id, e]) => [id, key(e)])),
    invites: new Map(Object.values(db.invites).map((i) => [i.id, key(i)])),
    slots: new Map(Object.values(db.slots).map((s) => [s.id, key(s)])),
    applied,
    groups: new Map(Object.values(db.groups).map((g) => [g.id, key(g)])),
    chats: new Map(Object.values(db.chats).map((c) => [c.id, key({ ...c, messages: undefined })])),
    messages: msgIds,
    reports: new Map(db.reports.map((r) => [r.id, key(r)])),
    catalog: key([db.catalog, db.catalogCursor]),
    ticks: key(db.ticks),
  };
  return { db, snap };
}

function userCols(u: User) {
  const { wallet: _w, ...rest } = u;
  return rest;
}

/** 바뀐 것만 저장해요. 지갑 거래 기록(db.ledger)은 이번에 새로 생긴 것만 들어 있어서 모두 추가해요. */
export async function saveWorld(t: Tx, { db, snap }: Loaded) {
  // ── 사용자 ──
  const usedCodes = new Set(Object.values(db.users).map((u) => u.code).filter(Boolean));
  for (const u of Object.values(db.users)) {
    const before = snap.users.get(u.id);
    if (before === key(userCols(u))) continue;
    if (!u.code) u.code = freshCode(usedCodes);
    const cols = {
      status: u.status,
      is_demo: u.isDemo,
      profile: u.profile ?? null,
      match_traits: u.matchTraits ?? null,
      prefs: u.prefs ?? null,
      answers: u.answers ?? null,
      partner_wants: u.partnerWants ?? null,
      analysis: u.analysis ?? null,
    };
    if (before === undefined) {
      await t`
        insert into users (id, code, created_at, is_demo, status, profile, match_traits, prefs, answers, partner_wants, availability, analysis, group_id)
        values (${u.id}, ${u.code!}, ${ts(u.createdAt)}, ${u.isDemo}, ${u.status}, ${json(t, cols.profile)}, ${json(t, cols.match_traits)},
          ${json(t, cols.prefs)}, ${json(t, cols.answers)}, ${json(t, cols.partner_wants)}, ${u.availability ?? []}, ${json(t, cols.analysis)}, ${u.groupId ?? null})`;
    } else {
      await t`
        update users set status = ${u.status}, is_demo = ${u.isDemo}, profile = ${json(t, cols.profile)}, match_traits = ${json(t, cols.match_traits)},
          prefs = ${json(t, cols.prefs)}, answers = ${json(t, cols.answers)}, partner_wants = ${json(t, cols.partner_wants)},
          availability = ${u.availability ?? []}, analysis = ${json(t, cols.analysis)}, group_id = ${u.groupId ?? null}
        where id = ${u.id}`;
    }
  }
  const goneUsers = [...snap.users.keys()].filter((id) => !db.users[id]);
  if (goneUsers.length) await t`delete from users where id = any(${goneUsers})`;

  // ── 지갑 ──
  for (const u of Object.values(db.users)) {
    if (!u.wallet || snap.wallets.get(u.id) === key(u.wallet)) continue;
    await saveWallet(t, u.id, u.wallet);
  }
  for (const tx of db.ledger) {
    await t`insert into ledger (user_id, at, kind, item, amount, note, ref)
      values (${tx.userId}, ${ts(tx.at)}, ${tx.kind}, ${tx.item}, ${tx.amount}, ${tx.note}, ${tx.ref ?? null})`;
  }

  // ── 대기실 ──
  for (const [id, e] of Object.entries(db.lobby)) {
    if (snap.lobby.get(id) === key(e) || !db.users[id]) continue;
    await saveLobby(t, id, e);
  }
  const goneLobby = [...snap.lobby.keys()].filter((id) => !db.lobby[id]);
  if (goneLobby.length) await t`delete from lobby where user_id = any(${goneLobby})`;

  // ── 이벤트 세션 (초대장·그룹보다 먼저: 초대장이 세션을 가리켜요) ──
  for (const s of Object.values(db.slots)) {
    if (snap.slots.get(s.id) === key(s)) continue;
    await saveSlot(t, s, snap.applied);
  }
  const goneSlots = [...snap.slots.keys()].filter((id) => !db.slots[id]);
  if (goneSlots.length) await t`delete from slots where id = any(${goneSlots})`;

  // ── 초대장 ──
  for (const i of Object.values(db.invites)) {
    if (snap.invites.get(i.id) === key(i)) continue;
    await saveInvite(t, i);
  }
  const goneInvites = [...snap.invites.keys()].filter((id) => !db.invites[id]);
  if (goneInvites.length) await t`delete from invites where id = any(${goneInvites})`;

  // ── 그룹 (쪽지·메모·주인 찾기·접속 기록·직진 포함) ──
  for (const g of Object.values(db.groups)) {
    if (snap.groups.get(g.id) === key(g)) continue;
    await saveGroup(t, g, snap.groups.has(g.id));
  }
  const goneGroups = [...snap.groups.keys()].filter((id) => !db.groups[id]);
  if (goneGroups.length) await t`delete from groups where id = any(${goneGroups})`;

  // ── 채팅 ──
  for (const c of Object.values(db.chats)) {
    if (snap.chats.get(c.id) !== key({ ...c, messages: undefined })) await saveChat(t, c);
    const had = snap.messages.get(c.id) ?? new Set<string>();
    const now = new Set(c.messages.map((m) => m.id));
    for (const m of c.messages) {
      if (had.has(m.id)) continue;
      await t`insert into chat_messages (id, chat_id, from_id, text, at) values (${m.id}, ${c.id}, ${m.from}, ${m.text}, ${ts(m.at)})`;
    }
    const removed = [...had].filter((id) => !now.has(id));
    if (removed.length) await t`delete from chat_messages where id = any(${removed})`;
  }
  const goneChats = [...snap.chats.keys()].filter((id) => !db.chats[id]);
  if (goneChats.length) await t`delete from chats where id = any(${goneChats})`;

  // ── 신고 ──
  for (const r of db.reports) {
    if (snap.reports.get(r.id) === key(r)) continue;
    await saveReport(t, r);
  }
  const reportIds = new Set(db.reports.map((r) => r.id));
  const goneReports = [...snap.reports.keys()].filter((id) => !reportIds.has(id));
  if (goneReports.length) await t`delete from reports where id = any(${goneReports})`;

  // ── 테마 게시판 · 주기 처리 시각 ──
  if (snap.catalog !== key([db.catalog, db.catalogCursor])) {
    if (db.catalog) {
      await t`
        insert into theme_catalog (id, created_at, source, note, themes, cursor)
        values (1, ${ts(db.catalog.createdAt)}, ${db.catalog.source}, ${db.catalog.note}, ${t.json(db.catalog.themes as never)}, ${db.catalogCursor})
        on conflict (id) do update set created_at = excluded.created_at, source = excluded.source, note = excluded.note,
          themes = excluded.themes, cursor = excluded.cursor`;
    } else {
      await t`delete from theme_catalog`;
    }
  }
  if (snap.ticks !== key(db.ticks)) {
    for (const [k, at] of Object.entries(db.ticks ?? {})) {
      await t`insert into ticks (key, at) values (${k}, ${ts(at)}) on conflict (key) do update set at = excluded.at`;
    }
  }
}

// deno-lint-ignore no-explicit-any
function json(t: Tx, v: any) {
  return v === null || v === undefined ? null : t.json(v);
}

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function freshCode(used: Set<string | undefined>) {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const c = Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
    if (/[0-9]/.test(c) && /[A-Z]/.test(c) && !used.has(c)) {
      used.add(c);
      return c;
    }
  }
}

async function saveWallet(t: Tx, userId: string, w: Wallet) {
  await t`
    insert into wallets (user_id, free_doki, paid_doki, tickets, badges, auto_exchange)
    values (${userId}, ${w.freeDoki}, ${w.paidDoki}, ${w.tickets}, ${w.badges}, ${w.autoExchange !== false})
    on conflict (user_id) do update set free_doki = excluded.free_doki, paid_doki = excluded.paid_doki,
      tickets = excluded.tickets, badges = excluded.badges, auto_exchange = excluded.auto_exchange`;
  await t`delete from wallet_holds where user_id = ${userId}`;
  for (const [ref, h] of Object.entries(w.holds)) {
    await t`insert into wallet_holds (user_id, ref, item, at) values (${userId}, ${ref}, ${h.item}, ${ts(h.at)})`;
  }
}

async function saveLobby(t: Tx, userId: string, e: LobbyEntry) {
  await t`
    insert into lobby (user_id, joined_at, last_seen, interests, priority, note)
    values (${userId}, ${ts(e.joinedAt)}, ${e.lastSeen ? ts(e.lastSeen) : null}, ${e.interests}, ${e.priority}, ${e.note ?? null})
    on conflict (user_id) do update set joined_at = excluded.joined_at, last_seen = excluded.last_seen,
      interests = excluded.interests, priority = excluded.priority, note = excluded.note`;
}

async function saveInvite(t: Tx, i: Invite) {
  await t`
    insert into invites (id, kind, created_at, expires_at, starts_at, theme, invitees, accepted, declined, status, group_id, slot_id, source, demo_plan)
    values (${i.id}, ${i.kind}, ${ts(i.createdAt)}, ${ts(i.expiresAt)}, ${ts(i.startsAt)}, ${t.json(i.theme as never)}, ${i.invitees},
      ${i.accepted}, ${i.declined}, ${i.status}, ${i.groupId ?? null}, ${i.slotId ?? null}, ${i.source}, ${json(t, i.demoPlan)})
    on conflict (id) do update set expires_at = excluded.expires_at, starts_at = excluded.starts_at, theme = excluded.theme,
      invitees = excluded.invitees, accepted = excluded.accepted, declined = excluded.declined, status = excluded.status,
      group_id = excluded.group_id, slot_id = excluded.slot_id, source = excluded.source, demo_plan = excluded.demo_plan`;
}

async function saveSlot(t: Tx, s: Slot, applied: Map<string, number>) {
  await t`
    insert into slots (id, created_at, theme, starts_at, status, group_ids, missed, note, round_seconds, invite_only, curated, capacity, forming_ids)
    values (${s.id}, ${ts(s.createdAt)}, ${t.json(s.theme as never)}, ${ts(s.startsAt)}, ${s.status}, ${s.groupIds}, ${s.missed},
      ${s.note ?? null}, ${s.roundSeconds ?? null}, ${Boolean(s.inviteOnly)}, ${Boolean(s.curated)}, ${s.capacity ?? null}, ${s.formingIds ?? null})
    on conflict (id) do update set theme = excluded.theme, starts_at = excluded.starts_at, status = excluded.status,
      group_ids = excluded.group_ids, missed = excluded.missed, note = excluded.note, round_seconds = excluded.round_seconds,
      invite_only = excluded.invite_only, curated = excluded.curated, capacity = excluded.capacity, forming_ids = excluded.forming_ids`;
  await t`delete from slot_applicants where slot_id = ${s.id}`;
  // 신청 순서를 지켜요: 원래 신청 시각은 그대로, 새로 신청한 사람은 지금 시각(+순서)
  let next = Date.now();
  let last = 0;
  for (const uid of s.applicants) {
    const at = Math.max(applied.get(`${s.id}/${uid}`) ?? next++, last + 1);
    last = at;
    await t`insert into slot_applicants (slot_id, user_id, applied_at, checkin_at)
      values (${s.id}, ${uid}, ${ts(at)}, ${ts(s.checkins[uid])})`;
  }
}

async function saveGroup(t: Tx, g: Group, existed: boolean) {
  await t`
    insert into groups (id, created_at, theme, member_ids, reason, icebreakers, status, rounds, round_seconds, break_seconds, started_at, finished_at)
    values (${g.id}, ${ts(g.createdAt)}, ${t.json(g.theme as never)}, ${g.memberIds}, ${g.reason}, ${g.icebreakers}, ${g.status},
      ${t.json(g.rounds as never)}, ${g.roundSeconds}, ${g.breakSeconds}, ${ts(g.startedAt)}, ${ts(g.finishedAt)})
    on conflict (id) do update set theme = excluded.theme, member_ids = excluded.member_ids, reason = excluded.reason,
      icebreakers = excluded.icebreakers, status = excluded.status, rounds = excluded.rounds, round_seconds = excluded.round_seconds,
      break_seconds = excluded.break_seconds, started_at = excluded.started_at, finished_at = excluded.finished_at`;
  if (existed) {
    await t`delete from presence where group_id = ${g.id}`;
    await t`delete from letters where group_id = ${g.id}`;
    await t`delete from memos where group_id = ${g.id}`;
    await t`delete from reveals where group_id = ${g.id}`;
    await t`delete from straights where group_id = ${g.id}`;
  }
  for (const [round, byUser] of Object.entries(g.presence ?? {})) {
    for (const [uid, p] of Object.entries(byUser)) {
      await t`insert into presence (group_id, round, user_id, first_at, last_at) values (${g.id}, ${Number(round)}, ${uid}, ${ts(p.first)}, ${ts(p.last)})`;
    }
  }
  for (const [from, byTo] of Object.entries(g.letters)) {
    for (const [to, text] of Object.entries(byTo)) {
      await t`insert into letters (group_id, from_id, to_id, text) values (${g.id}, ${from}, ${to}, ${text})`;
    }
  }
  for (const [from, byTo] of Object.entries(g.memos)) {
    for (const [to, text] of Object.entries(byTo)) {
      await t`insert into memos (group_id, from_id, to_id, text) values (${g.id}, ${from}, ${to}, ${text})`;
    }
  }
  for (const [uid, from] of Object.entries(g.reveals)) {
    await t`insert into reveals (group_id, user_id, from_id) values (${g.id}, ${uid}, ${from})`;
  }
  for (const [from, s] of Object.entries(g.straights ?? {}) as [string, Straight][]) {
    await t`insert into straights (group_id, from_id, to_id, message, at, expires_at, status, chat_id, demo_reply)
      values (${g.id}, ${from}, ${s.to}, ${s.message}, ${ts(s.at)}, ${ts(s.expiresAt)}, ${s.status}, ${s.chatId ?? null}, ${json(t, s.demoReply)})`;
  }
}

async function saveChat(t: Tx, c: Chat) {
  await t`
    insert into chats (id, group_id, members, origin, created_at, expires_at)
    values (${c.id}, ${c.groupId}, ${c.members}, ${c.origin ?? "mutual"}, ${ts(c.createdAt)}, ${ts(c.expiresAt)})
    on conflict (id) do update set members = excluded.members, origin = excluded.origin, expires_at = excluded.expires_at`;
}

async function saveReport(t: Tx, r: UserReport) {
  await t`
    insert into reports (id, at, reporter_id, target_code, target_id, reason, detail, context, status)
    values (${r.id}, ${ts(r.at)}, ${r.reporterId}, ${r.targetCode}, ${r.targetId}, ${r.reason}, ${r.detail}, ${r.context}, ${r.status})
    on conflict (id) do update set status = excluded.status, detail = excluded.detail`;
}
