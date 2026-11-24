// 도메인 로직 ↔ DB 테이블: 저장했다가 다시 불러오면 똑같은지, 대기실 → 초대장 → 그룹 시작 흐름
//   HIRO_DB_URL=postgres://... HIRO_TEST_AUTH=1 deno test -A --config api/deno.json tests/
import { DEFAULT_PREFS } from "../_shared/compat.ts";
import { makeDemoUser } from "../_shared/demo.ts";
import { createGroup } from "../_shared/groups.ts";
import { joinLobby } from "../_shared/lobby.ts";
import { ensureWallet } from "../_shared/wallet.ts";
import { createSlotIn, setApplied } from "../_shared/slots.ts";
import { QUESTIONS } from "../_shared/questions.ts";
import { ALL_CELLS } from "../_shared/schedule.ts";
import type { DB, User } from "../_shared/types.ts";
import { newId } from "../_shared/world.ts";
import { closeDb, db } from "../_shared/server/db.ts";
import { runTick } from "../_shared/server/tick.ts";
import { inWorld, snapshot } from "../_shared/server/world-tx.ts";
import { handle } from "../api/router.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("실패: " + msg);
}

/** 키 순서와 undefined를 무시하고 비교하려고 정렬한 JSON으로 바꿔요. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined && y !== false).sort(([a], [b]) => a.localeCompare(b)))
      : x);
}

function comparable(d: DB) {
  const users = Object.fromEntries(
    Object.entries(d.users).map(([id, u]) => [id, { ...u, availability: u.availability?.length ? u.availability : undefined }]),
  );
  return { ...d, users, ledger: [], ticks: undefined };
}

async function call(authId: string, method: string, path: string, body?: unknown) {
  const res = await handle(
    new Request("http://local/functions/v1/api" + path, {
      method,
      headers: { "content-type": "application/json", "x-test-auth-id": authId },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  // deno-lint-ignore no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}

const WIDE = { ...DEFAULT_PREFS, hair: [] };
const theme = { id: "t_test", title: "테스트 테마", emoji: "🧪", description: "테스트", tags: [] };

/** 서로 모두 대화할 수 있는 데모 참가자 */
function friendlyDemo(i: number): User {
  const u = makeDemoUser(i);
  u.matchTraits = { ...u.matchTraits!, tg: 5, smoke: "none", tattoo: "none", piercing: "none" };
  u.prefs = WIDE;
  return u;
}

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "준비: 테스트 DB 비우기", ...opts, fn: async () => {
  assert(Deno.env.get("HIRO_TEST_AUTH") === "1", "테스트 DB에서만 실행해요");
  await db()`truncate users, ledger, invites, slots, theme_catalog, groups, chats, reports, ticks cascade`;
} });

Deno.test({ name: "저장했다가 다시 불러오면 똑같아요 (모든 종류의 데이터)", ...opts, fn: async () => {
  const before = await inWorld((d) => {
    const demos = Array.from({ length: 5 }, (_, i) => friendlyDemo(100 + i));
    for (const u of demos) d.users[u.id] = u;
    const real: User = { ...friendlyDemo(200), id: newId("u"), isDemo: false };
    d.users[real.id] = real;
    ensureWallet(d, real.id);
    d.users[real.id].wallet!.freeDoki = 7;
    joinLobby(real.id, ["t_test"]);
    d.lobby[real.id].priority = 2;
    d.lobby[real.id].note = "우선 안내";
    const g = createGroup(d, { theme, memberIds: [real.id, ...demos.slice(0, 3).map((u) => u.id)], reason: "테스트", startInMs: 0 })!;
    assert(g, "그룹 생성");
    g.letters[real.id] = { [demos[0].id]: "쪽지" };
    g.memos[real.id] = { [demos[1].id]: "메모" };
    g.reveals[demos[0].id] = real.id;
    g.presence = { 0: { [real.id]: { first: 1_000, last: 2_000 } } };
    g.straights = { [demos[1].id]: { to: real.id, message: "직진", at: 3_000, expiresAt: 4_000, status: "pending", demoReply: { at: 3_500, accept: true } } };
    d.chats["chat_t"] = {
      id: "chat_t", groupId: g.id, members: [real.id, demos[0].id], origin: "mutual", createdAt: 5_000, expiresAt: Date.now() + 3600_000,
      messages: [{ id: "m1", from: real.id, text: "안녕", at: 5_001 }, { id: "m2", from: demos[0].id, text: "반가워요", at: 5_002 }],
    };
    d.reports.push({ id: "r1", at: 6_000, reporterId: real.id, targetCode: "ABC23", targetId: demos[2].id, reason: "기타", detail: "", context: "chat:chat_t", status: "new" });
    d.catalog = { createdAt: 7_000, source: "rule", note: "테스트", themes: [theme] };
    d.catalogCursor = 1;
    const s = createSlotIn(30, 120, "테스트 테마");
    setApplied(demos[3].id, s.id, true);
    setApplied(demos[4].id, s.id, true);
    d.slots[s.id].checkins[demos[3].id] = 8_000;
    d.invites["inv_t"] = {
      id: "inv_t", kind: "scheduled", createdAt: 9_000, expiresAt: 10_000, startsAt: 11_000, theme, invitees: [demos[3].id, demos[4].id],
      accepted: [demos[3].id], declined: [], status: "open", source: "rule", demoPlan: { [demos[4].id]: { at: 9_500.5, accept: false } },
    };
    return structuredClone(d);
  });
  const after = await snapshot();
  // 공개 ID는 저장할 때 새 사용자에게 붙여요.
  for (const [id, u] of Object.entries(before.users)) {
    assert(/^[2-9A-HJ-NP-Z]{5}$/.test(after.users[id]?.code ?? ""), "새 사용자 공개 ID");
    u.code ??= after.users[id].code;
  }
  assert(canon(comparable(before)) === canon(comparable(after)), "불러온 데이터가 달라요\n" + diff(comparable(before), comparable(after)));
  const [{ n }] = await db()`select count(*)::int as n from ledger`;
  assert(n >= 3, "지갑 기록 저장 (가입 선물·예치)");
  // 아무것도 안 바꾸면 그대로
  await inWorld(() => null);
  assert(canon(comparable(after)) === canon(comparable(await snapshot())), "바꾼 게 없으면 그대로");
} });

function diff(a: DB | object, b: DB | object) {
  const A = JSON.parse(canon(a)), B = JSON.parse(canon(b));
  const out: string[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
      for (const k of Object.keys({ ...a, ...b })) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    } else out.push(`${path}:\n  ${JSON.stringify(a)}\n  ${JSON.stringify(b)}`);
  };
  walk(A, B, "db");
  return out.join("\n").slice(0, 3000);
}

const PROFILE = {
  nickname: "나",
  birthYear: 1995,
  region: "서울",
  bio: "",
  tags: [],
  confirmWoman: true,
  availability: [],
  matchTraits: { hair: "단머", tg: 5, showTg: true },
  prefs: { hair: [], tgMin: 0, tgMax: 10, platonic: "ok" },
};
const QUIZ = {
  habits: { smoke: "none", tattoo: "none", piercing: "none" },
  allow: { smokeMax: "cig", tattooMax: "large", piercingMax: "face" },
  answers: QUESTIONS.map(() => 3),
  partnerWants: { energy: "any", empathy: "any", planning: "any", openness: "any", expression: "any" },
};

Deno.test({ name: "대기실 → 바로 시작 초대장 → 수락 → 그룹 시작, 입장권 예치", ...opts, fn: async () => {
  await db()`truncate users, ledger, invites, slots, theme_catalog, groups, chats, reports, ticks cascade`;
  const me = crypto.randomUUID();
  await call(me, "POST", "/profile", PROFILE);
  let r = await call(me, "POST", "/lobby", { action: "join" });
  assert(r.status === 400, "검사 전에는 대기실에 못 들어가요");
  await call(me, "POST", "/quiz", QUIZ);
  r = await call(me, "POST", "/lobby", { action: "join" });
  assert(r.status === 200 && r.body.inLobby && r.body.canEnter && r.body.tickets === 5, "대기실 입장 " + JSON.stringify(r.body).slice(0, 200));

  // 데모 참가자 5명도 대기실에
  await inWorld((d) => {
    for (let i = 0; i < 5; i++) {
      const u = friendlyDemo(i);
      d.users[u.id] = u;
      joinLobby(u.id);
    }
  });
  const tick = await runTick({ forceInvite: "now" });
  assert(tick.invites.length === 1, "초대장 1장 " + JSON.stringify(tick));
  r = await call(me, "GET", "/lobby");
  assert(r.body.invite && r.body.invite.status === "open" && r.body.invite.invited >= 4, "나에게 온 초대장 " + JSON.stringify(r.body.invite));
  const inviteId = r.body.invite.id;

  // 데모는 모두 곧바로 수락하도록
  await inWorld((d) => {
    for (const p of Object.values(d.invites[inviteId].demoPlan ?? {})) {
      p.at = 0;
      p.accept = true;
    }
  });
  r = await call(me, "POST", "/invites/respond", { inviteId, accept: true });
  assert(r.status === 200 && r.body.invite.iAccepted, "수락 " + JSON.stringify(r.body).slice(0, 300));
  await runTick({ force: true });

  r = await call(me, "GET", "/state");
  const g = r.body.group;
  assert(r.body.user.status === "grouped" && g, "그룹 시작 " + JSON.stringify(r.body).slice(0, 300));
  assert(g.members.length >= 4 && g.members.length <= 6, `인원 4~6명 (${g.members.length})`);
  assert(g.myPartnerCount === g.members.length - 1, "모두 서로 대화 가능");
  assert(r.body.wallet.groupTicket.held === g.myPartnerCount && r.body.wallet.tickets === 5 - g.myPartnerCount, "대화 상대 수만큼 예치 " + JSON.stringify(r.body.wallet));
  r = await call(me, "GET", "/lobby");
  assert(r.body.invite?.status === "started" && r.body.invite.iGotIn && !r.body.inLobby, "초대장 시작됨, 대기실에서 나옴");
  r = await call(me, "POST", "/lobby", { action: "join" });
  assert(r.status === 409, "대화 중에는 대기실에 못 들어가요");

  // DB에 실제로 저장됐는지
  const [row] = await db()`select count(*)::int as n from wallet_holds where ref like ${"group:" + g.id + ":%"}`;
  assert(row.n === g.myPartnerCount, `예치 행 저장 (${row.n})`); // 데모 참가자는 지갑을 쓰지 않아요
} });

Deno.test({ name: "예약 초대장 → 모두 수락 → 그 시간의 비공개 세션 확정", ...opts, fn: async () => {
  await db()`truncate users, ledger, invites, slots, theme_catalog, groups, chats, reports, ticks cascade`;
  const me = crypto.randomUUID();
  await call(me, "POST", "/profile", { ...PROFILE, availability: ALL_CELLS });
  await call(me, "POST", "/quiz", QUIZ);
  await inWorld((d) => {
    for (let i = 0; i < 4; i++) {
      const u = friendlyDemo(i);
      u.availability = [...ALL_CELLS];
      d.users[u.id] = u;
    }
  });
  const tick = await runTick({ forceInvite: "scheduled" });
  assert(tick.invites.length === 1, "예약 초대장 1장 " + JSON.stringify(tick));
  let r = await call(me, "GET", "/lobby");
  const inv = r.body.scheduled[0];
  assert(inv && inv.startsAt - Date.now() >= 3 * 3600_000 - 5_000, "3시간 이후의 시간 " + JSON.stringify(r.body.scheduled));
  await inWorld((d) => {
    for (const p of Object.values(d.invites[inv.id].demoPlan ?? {})) {
      p.at = 0;
      p.accept = true;
    }
  });
  await call(me, "POST", "/invites/respond", { inviteId: inv.id, accept: true });
  await runTick({ force: true });
  r = await call(me, "GET", "/lobby");
  assert(r.body.reservations.length === 1 && r.body.reservations[0].startsAt === inv.startsAt, "예약 확정 " + JSON.stringify(r.body.reservations));
  const [slot] = await db()`select invite_only, (select count(*)::int from slot_applicants a where a.slot_id = s.id) as n from slots s where id = ${r.body.reservations[0].slotId}`;
  assert(slot.invite_only && slot.n === 5, "DB의 비공개 세션과 신청자 5명");
  r = await call(me, "GET", "/state");
  assert(r.body.user.status !== "grouped" && r.body.wallet.groupTicket === null, "예약 확정만으로는 입장권을 맡기지 않아요 (그 시간에 그룹이 될 때 맡겨요)");
} });

Deno.test({ name: "동시에 주기 처리를 불러도 한 번만 돌아요", ...opts, fn: async () => {
  await db()`delete from ticks`;
  const results = await Promise.all(Array.from({ length: 5 }, () => runTick()));
  assert(results.filter((x) => x.ran).length === 1, `한 번만 (${results.map((x) => x.ran)})`);
} });

Deno.test({ name: "정리", ...opts, fn: async () => {
  await closeDb();
} });
