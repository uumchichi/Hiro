// 로테이션 전체 흐름 (실제 사용자 4명, 데모 없이 결과가 정해지게):
// 그룹 시작 → 1:1 대화 성사로 입장권 차감 → 쪽지·메모 → 끝나면 남은 입장권 반환 → 리포트 →
// 쪽지 주인 찾기(서로 지목 → 채팅) → 직진 → 신고 → 이벤트 세션 신청·입장·시작 → 운영자·예약 작업
//   HIRO_DB_URL=postgres://... HIRO_TEST_AUTH=1 deno test -A --config api/deno.json tests/
import { createGroup } from "../_shared/groups.ts";
import { QUESTIONS } from "../_shared/questions.ts";
import { closeDb, db } from "../_shared/server/db.ts";
import { inWorld } from "../_shared/server/world-tx.ts";
import { handle } from "../api/router.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("실패: " + msg);
}

const ADMIN = "test-admin-key";
const CRON = "test-cron-key";
Deno.env.set("HIRO_ADMIN_KEY", ADMIN);
Deno.env.set("HIRO_CRON_KEY", CRON);
Deno.env.set("HIRO_TICKET_AFTER_SECONDS", "0"); // 대화가 이어지자마자 차감 (테스트용)

async function call(who: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { "content-type": "application/json", ...headers };
  if (who) h["x-test-auth-id"] = who;
  const res = await handle(
    new Request("http://local/functions/v1/api" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }),
  );
  // deno-lint-ignore no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}
const admin = (method: string, path: string, body?: unknown) => call(null, method, path, body, { "x-admin-key": ADMIN });

const PROFILE = (nickname: string) => ({
  nickname,
  birthYear: 1995,
  region: "서울",
  bio: "",
  tags: [],
  confirmWoman: true,
  availability: [],
  matchTraits: { hair: "단머", tg: 5, showTg: true },
  prefs: { hair: [], tgMin: 0, tgMax: 10, platonic: "ok" },
});
const QUIZ = {
  habits: { smoke: "none", tattoo: "none", piercing: "none" },
  allow: { smokeMax: "cig", tattooMax: "large", piercingMax: "face" },
  answers: QUESTIONS.map(() => 3),
  partnerWants: { energy: "any", empathy: "any", planning: "any", openness: "any", expression: "any" },
};

const opts = { sanitizeOps: false, sanitizeResources: false };
const names = ["가람", "나래", "다솜", "라희"];
const auth: Record<string, string> = {};
const uid: Record<string, string> = {};
const code: Record<string, string> = {};
let gid = "";

/** 그룹 시작 시각을 옮겨서 시간을 빨리 감아요. */
async function moveTo(roundsPassed: number) {
  await inWorld((d) => {
    const g = d.groups[gid];
    g.startedAt = Date.now() - roundsPassed * (g.roundSeconds + g.breakSeconds) * 1000 - 1_000;
  });
}

Deno.test({ name: "운영자 키 확인 + 모두 지우기", ...opts, fn: async () => {
  assert((await call(null, "POST", "/admin/reset", {}, { "x-admin-key": "wrong" })).status === 403, "틀린 키는 403");
  assert((await call(crypto.randomUUID(), "GET", "/admin/overview")).status === 403, "일반 사용자는 403");
  const r = await admin("POST", "/admin/reset");
  assert(r.status === 200, "초기화");
} });

Deno.test({ name: "4명 가입 → 그룹 시작 → 대화 성사로 입장권 차감", ...opts, fn: async () => {
  for (const n of names) {
    auth[n] = crypto.randomUUID();
    await call(auth[n], "POST", "/profile", PROFILE(n));
    const r = await call(auth[n], "POST", "/quiz", QUIZ);
    uid[n] = r.body.user.id;
    code[n] = r.body.user.code;
  }
  gid = await inWorld((d) => {
    const g = createGroup(d, {
      theme: { id: "t", title: "테스트", emoji: "🧪", description: "", tags: [] },
      memberIds: names.map((n) => uid[n]),
      reason: "테스트",
      startInMs: 0,
      roundSeconds: 60,
    });
    return g!.id;
  });
  let r = await call(auth["가람"], "GET", "/state");
  assert(r.body.group?.roundCount === 3 && r.body.group.phase.kind === "talk" && r.body.group.room, "4명 → 3라운드, 첫 라운드 대화 중");
  assert(r.body.wallet.groupTicket.held === 3 && r.body.wallet.tickets === 2, "상대 3명분 예치 " + JSON.stringify(r.body.wallet));
  // 네 명 모두 대화방에 있다는 신호 → 첫 라운드 1:1 대화 성사 → 1장씩 차감
  for (const n of names) await call(auth[n], "GET", "/state?presence=1");
  for (const n of names) {
    r = await call(auth[n], "GET", "/state");
    assert(r.body.wallet.groupTicket.used === 1 && r.body.wallet.groupTicket.held === 2, `${n}: 1장 사용 ` + JSON.stringify(r.body.wallet.groupTicket));
  }
  r = await call(auth["가람"], "POST", "/voice/token");
  assert(r.status === 503, "LiveKit 설정이 없으면 503");
} });

Deno.test({ name: "쪽지·메모 → 로테이션 끝 → 남은 입장권 반환", ...opts, fn: async () => {
  await moveTo(2); // 마지막 라운드: 모두 서로 만났어요
  const note = (from: string, to: string, body: Record<string, string>) =>
    call(auth[from], "POST", "/notes", { groupId: gid, to: uid[to], ...body });
  assert((await note("가람", "나래", { letter: "또 이야기해요" })).status === 200, "가람 → 나래 쪽지");
  assert((await note("나래", "가람", { letter: "저도요!" })).status === 200, "나래 → 가람 쪽지");
  assert((await note("다솜", "가람", { letter: "다솜이 보낸 쪽지" })).status === 200, "다솜 → 가람 쪽지");
  assert((await note("가람", "다솜", { memo: "차분한 분" })).status === 200, "가람의 메모");
  const bad = await call(auth["가람"], "POST", "/notes", { groupId: gid, to: "u_nobody", letter: "?" });
  assert(bad.status === 409, "대화하지 않은 사람에게는 못 써요");
  assert((await call(auth["가람"], "POST", `/report/${gid}/reveal`, { index: 0 })).status === 409, "끝나기 전에는 주인 찾기 불가");

  await moveTo(3); // 끝
  let r = await call(auth["가람"], "GET", "/state");
  // 끝난 직후 첫 응답은 '끝남' 단계의 그룹을 한 번 보여줘요 (화면이 리포트로 넘어가는 신호)
  assert(r.body.group?.phase.kind === "finished" && r.body.group.status === "done", "끝남 단계");
  r = await call(auth["가람"], "GET", "/state");
  assert(r.body.user.status === "analyzed" && r.body.group === null && r.body.lastReportId === gid, "끝나면 풀려나고 리포트로 " + JSON.stringify(r.body.group));
  for (const n of names) {
    const w = await call(auth[n], "GET", "/wallet");
    assert(w.body.tickets === 4 && w.body.heldTickets === 0, `${n}: 1장만 쓰고 나머지 반환 (${w.body.tickets}, ${w.body.heldTickets})`);
  }
  assert((await note("가람", "라희", { letter: "늦은 쪽지" })).status === 409, "끝난 뒤에는 쪽지 못 고쳐요");
} });

let chatId = "";

Deno.test({ name: "리포트 → 서로 주인 찾기 → 24시간 채팅", ...opts, fn: async () => {
  let r = await call(auth["가람"], "GET", `/report/${gid}`);
  assert(r.status === 200 && r.body.done && r.body.received.length === 2, "받은 쪽지 2장 " + JSON.stringify(r.body).slice(0, 300));
  const idx = r.body.received.findIndex((x: { text: string }) => x.text === "저도요!");
  assert(idx >= 0 && !JSON.stringify(r.body.received).includes(uid["나래"]), "보낸 사람은 숨겨져 있어요");
  r = await call(auth["가람"], "POST", `/report/${gid}/reveal`, { index: idx });
  assert(r.status === 200 && r.body.chatId === null, "한쪽만 지목하면 아직 채팅 없음");
  assert((await call(auth["가람"], "POST", `/report/${gid}/reveal`, { index: 0 })).status === 409, "주인 찾기는 한 번만");
  r = await call(auth["나래"], "POST", `/report/${gid}/reveal`, { index: 0 });
  assert(r.status === 200 && r.body.chatId, "서로 지목 → 채팅방");
  chatId = r.body.chatId;

  r = await call(auth["가람"], "POST", `/chat/${chatId}`, { text: "안녕하세요!" });
  assert(r.status === 200 && r.body.messages?.length === 1, "메시지 보내기 " + JSON.stringify(r.body).slice(0, 200));
  r = await call(auth["나래"], "GET", `/chat/${chatId}`);
  assert(r.status === 200 && r.body.messages[0].text === "안녕하세요!", "상대가 받아요");
  assert((await call(auth["다솜"], "GET", `/chat/${chatId}`)).status === 404, "다른 사람은 못 봐요");
  r = await call(auth["가람"], "GET", "/records");
  assert(r.status === 200 && JSON.stringify(r.body).includes(chatId) && JSON.stringify(r.body).includes(gid), "내 기록에 리포트와 채팅방");
} });

Deno.test({ name: "직진: 증표 예치 → 수락 → 채팅, 증표 사용", ...opts, fn: async () => {
  // 다솜은 받은 쪽지가 없어서 바로 직진할 수 있어요 (가람에게 쪽지를 보냈어요).
  assert((await call(auth["라희"], "POST", `/report/${gid}/straight`, { action: "send", to: uid["가람"] })).status === 409, "쪽지 안 보낸 사람에게는 못 해요");
  let r = await call(auth["다솜"], "POST", `/report/${gid}/straight`, { action: "send", to: uid["가람"], message: "한번 더 이야기해요" });
  assert(r.status === 200, "직진 보내기 " + JSON.stringify(r.body));
  let w = await call(auth["다솜"], "GET", "/wallet");
  assert(w.body.badges === 1 && w.body.heldBadges === 1, "증표 예치");
  assert((await call(auth["다솜"], "POST", `/report/${gid}/straight`, { action: "send", to: uid["가람"] })).status === 409, "직진은 한 번만");
  r = await call(auth["가람"], "POST", `/report/${gid}/straight`, { action: "respond", from: uid["다솜"], accept: true });
  assert(r.status === 200 && r.body.chatId && r.body.chatId !== chatId, "수락 → 새 채팅방");
  w = await call(auth["다솜"], "GET", "/wallet");
  assert(w.body.badges === 0 && w.body.heldBadges === 0, "증표 사용");
} });

Deno.test({ name: "신고 → 운영자 현황", ...opts, fn: async () => {
  assert((await call(auth["가람"], "POST", "/reports", { code: code["가람"], reason: "기타" })).status === 404, "나 자신은 신고 불가");
  assert((await call(auth["가람"], "POST", "/reports", { code: "ZZZZ9", reason: "기타" })).status === 404, "없는 ID");
  const r = await call(auth["가람"], "POST", "/reports", { code: "#" + code["라희"].toLowerCase(), reason: "기타", detail: "테스트", context: `report:${gid}` });
  assert(r.status === 200, "공개 ID로 신고 (# · 소문자도 OK)");
  const o = await admin("GET", "/admin/overview");
  assert(o.status === 200 && o.body.reports.length === 1 && o.body.reports[0].target.includes(code["라희"]), "운영자 현황의 신고");
  assert(o.body.counts.real === 4 && o.body.groups[0].status === "done", "현황 숫자");
} });

Deno.test({ name: "이벤트 세션: 신청 → 대기실 입장 → 시작하면 그룹", ...opts, fn: async () => {
  let r = await admin("POST", "/admin/slot", { action: "create", minutes: 5, roundSeconds: 60 });
  assert(r.status === 200, "테스트 세션 만들기");
  const slotId = r.body.slotId;
  for (const n of names) {
    assert((await call(auth[n], "POST", "/slots/apply", { slotId, on: true })).status === 200, `${n} 신청`);
    assert((await call(auth[n], "POST", "/slots/checkin", { slotId })).status === 200, `${n} 대기실 입장`);
  }
  r = await call(auth["가람"], "GET", "/slots");
  const mine = r.body.slots.find((s: { id: string }) => s.id === slotId);
  assert(mine?.applied && mine.applicants === 4 && mine.present === 4 && r.body.slots.length >= 4, "게시판: 신청 4명, 입장 4명, 다른 세션도 채워짐");
  r = await admin("POST", "/admin/slot", { action: "startNow", slotId });
  assert(r.status === 200, "지금 시작");
  r = await call(auth["가람"], "GET", "/state");
  assert(r.body.user.status === "grouped" && r.body.group.members.length === 4 && r.body.wallet.groupTicket.held === 3, "세션이 그룹으로 시작 " + JSON.stringify(r.body.group).slice(0, 200));
  const ev = await admin("POST", "/admin/event", {
    action: "create", title: "고양이 집사 모임", startsAt: Date.now() + 3600_000, roundMinutes: 5, capacity: 8, tags: ["고양이 집사", "없는태그"],
  });
  assert(ev.status === 200, "운영진 이벤트 만들기");
  assert((await admin("POST", "/admin/event", { action: "cancel", slotId: ev.body.slotId })).status === 200, "이벤트 취소");
} });

Deno.test({ name: "운영자 지급 · 데모 · 테마 목록 · 예약 작업 주소", ...opts, fn: async () => {
  let r = await admin("POST", "/admin/wallet", { code: code["라희"], item: "doki", amount: 30 });
  assert(r.status === 200 && r.body.note.includes("도키 30개"), "도키 지급");
  r = await call(auth["라희"], "GET", "/wallet");
  assert(r.body.doki === 30, "지갑에 반영");
  r = await admin("POST", "/admin/seed", { count: 3 });
  assert(r.status === 200 && r.body.added === 3, "데모 3명");
  r = await admin("POST", "/admin/lobby", { action: "seed", count: 2 });
  assert(r.status === 200 && r.body.added === 2, "대기실 데모 2명");
  r = await admin("POST", "/admin/catalog");
  assert(r.status === 200 && r.body.themes.length > 0 && r.body.source === "rule", "테마 목록 (AI 키 없으면 규칙)");
  assert((await call(null, "POST", "/tick")).status === 403, "예약 작업 키 없으면 403");
  await db()`delete from ticks where key = 'world'`;
  r = await call(null, "POST", "/tick", {}, { "x-cron-key": CRON });
  assert(r.status === 200 && r.body.ran === true, "예약 작업 실행 " + JSON.stringify(r.body));
} });

Deno.test({ name: "정리", ...opts, fn: async () => {
  await closeDb();
} });
