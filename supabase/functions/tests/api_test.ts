// API 통합 테스트: 로컬 Postgres에 마이그레이션을 적용한 DB로 실행해요.
//   HIRO_DB_URL=postgres://... HIRO_TEST_AUTH=1 deno test -A --config api/deno.json tests/
import { closeDb, db } from "../_shared/server/db.ts";
import { QUESTIONS } from "../_shared/questions.ts";
import { handle } from "../api/router.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("실패: " + msg);
}

async function call(authId: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authId) headers["x-test-auth-id"] = authId;
  const res = await handle(
    new Request("http://local/functions/v1/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined }),
  );
  // deno-lint-ignore no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}

const PROFILE = {
  nickname: "테스트",
  birthYear: 1995,
  region: "서울",
  bio: "안녕하세요",
  tags: ["고양이 집사", "없는태그"],
  confirmWoman: true,
  availability: ["5-evening", "nope"],
  matchTraits: { hair: "단머", tg: 3, showTg: false },
  prefs: { hair: ["긴머", "중단"], tgMin: 5, tgMax: 10, platonic: "no" },
};
const QUIZ = {
  habits: { smoke: "none", tattoo: "small", piercing: "ears" },
  allow: { smokeMax: "ecig", tattooMax: "medium", piercingMax: "face" },
  answers: QUESTIONS.map(() => 4),
  partnerWants: { energy: "high", empathy: "any", planning: "low", openness: "any", expression: "high" },
};

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({ name: "health, 로그인 없음 401, 없는 주소 404", ...opts, fn: async () => {
  assert((await call(null, "GET", "/health")).status === 200, "health");
  const r = await call(null, "GET", "/state");
  assert(r.status === 401 && r.body.error, "401");
  assert((await call(crypto.randomUUID(), "GET", "/nope")).status === 404, "404");
} });

Deno.test({ name: "첫 방문 요청이 동시에 와도 사용자는 한 명", ...opts, fn: async () => {
  const a = crypto.randomUUID();
  const rs = await Promise.all(Array.from({ length: 6 }, () => call(a, "GET", "/state")));
  const ids = new Set(rs.map((r) => r.body.user.id));
  assert(rs.every((r) => r.status === 200), "모두 200");
  assert(ids.size === 1, `사용자 1명 (${ids.size})`);
  const [{ n }] = await db()`select count(*)::int as n from users where auth_id = ${a}`;
  assert(n === 1, "DB에도 1명");
  const r = rs[0].body;
  assert(/^u_[0-9a-f]{12}$/.test(r.user.id) && /^[2-9A-HJ-NP-Z]{5}$/.test(r.user.code), "id·공개 ID 형식");
  assert(r.user.status === "new" && r.wallet === null, "가입 전에는 지갑 없음");
} });

Deno.test({ name: "가입 → 성향 검사 → 가입 선물", ...opts, fn: async () => {
  const a = crypto.randomUUID();
  assert((await call(a, "POST", "/quiz", QUIZ)).status === 400, "프로필 전 검사는 400");
  assert((await call(a, "POST", "/profile", { ...PROFILE, confirmWoman: false })).status === 400, "여성 확인 필수");
  assert((await call(a, "POST", "/profile", { ...PROFILE, birthYear: new Date().getFullYear() - 10 })).status === 400, "만 19세 이상");
  let r = await call(a, "POST", "/profile", PROFILE);
  assert(r.status === 200, "프로필 저장 " + JSON.stringify(r.body));
  assert(r.body.user.status === "profiled", "profiled");
  assert(r.body.user.profile.tags.join() === "고양이 집사", "없는 태그는 빼요");
  assert(r.body.user.availability.join() === "5-evening", "없는 시간대는 빼요");
  assert(r.body.wallet.tickets === 5 && r.body.wallet.badges === 1, "가입 선물 5장 + 1개");
  // 프로필을 다시 저장해도 선물은 한 번만
  r = await call(a, "POST", "/profile", PROFILE);
  assert(r.body.wallet.tickets === 5, "선물 중복 없음");
  r = await call(a, "POST", "/quiz", QUIZ);
  assert(r.status === 200 && r.body.user.status === "analyzed", "analyzed");
  assert(r.body.analysis === undefined && r.body.user.analysis.typeName, "분석 결과");
  assert(r.body.user.matchTraits.tattoo === "small" && r.body.user.matchTraits.hair === "단머", "문담피는 검사에서, 머리 길이는 그대로");
  assert(r.body.user.prefs.tattooMax === "medium" && r.body.user.prefs.tgMin === 5, "허용 범위 합치기");
  // 검사 후 프로필을 고쳐도 문담피·상태는 유지
  r = await call(a, "POST", "/profile", { ...PROFILE, nickname: "바꾼이름" });
  assert(r.body.user.status === "analyzed" && r.body.user.matchTraits.tattoo === "small", "검사 결과 유지");
} });

Deno.test({ name: "지갑: 미리 바꾸기, 자동 교환, 동시 요청", ...opts, fn: async () => {
  const a = crypto.randomUUID();
  await call(a, "POST", "/profile", PROFILE);
  let r = await call(a, "GET", "/wallet");
  assert(r.status === 200 && r.body.doki === 0 && r.body.tickets === 5, "처음 지갑");
  assert(r.body.history.length === 2, "가입 선물 기록 2줄");
  r = await call(a, "POST", "/wallet", { action: "exchange", item: "ticket", count: 5 });
  assert(r.status === 409 && r.body.error.includes("45도키") && r.body.tickets === 5, "도키 부족 409 + 지갑");
  assert((await call(a, "POST", "/wallet", { action: "exchange", item: "ticket", count: 3 })).status === 409, "없는 묶음");
  const uid = r.body ? (await call(a, "GET", "/state")).body.user.id : "";
  await db()`select wallet_grant(${uid}, 'doki', 50, '테스트')`;
  // 45도키짜리 묶음을 동시에 두 번: 한 번만 성공해야 해요.
  const both = await Promise.all([1, 2].map(() => call(a, "POST", "/wallet", { action: "exchange", item: "ticket", count: 5 })));
  const ok = both.filter((x) => x.status === 200);
  assert(ok.length === 1, `동시 교환은 1번만 성공 (${both.map((x) => x.status)})`);
  r = await call(a, "GET", "/wallet");
  assert(r.body.doki === 5 && r.body.tickets === 10, `5도키·10장 남음 (${r.body.doki}, ${r.body.tickets})`);
  r = await call(a, "POST", "/wallet", { action: "autoExchange", on: false });
  assert(r.status === 200 && r.body.autoExchange === false, "자동 교환 끄기");
  assert((await call(a, "POST", "/wallet", { action: "bogus" })).status === 400, "잘못된 요청");
  r = await call(a, "GET", "/state");
  assert(r.body.wallet.tickets === 10, "상태 화면 지갑");
} });

Deno.test({ name: "정리", ...opts, fn: async () => {
  await closeDb();
} });
