// 서버 점검과 오류 이유 표시: 운영자 키가 있을 때만 이유가 보이고, 일반 사용자에게는 숨겨져요.
import { closeDb, db } from "../_shared/server/db.ts";
import { handle } from "../api/router.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error("실패: " + msg);
}

const ADMIN = "diag-admin-key";
Deno.env.set("HIRO_ADMIN_KEY", ADMIN);
const opts = { sanitizeOps: false, sanitizeResources: false };

async function call(method: string, path: string, headers: Record<string, string> = {}) {
  const res = await handle(new Request("http://local/functions/v1/api" + path, { method, headers }));
  // deno-lint-ignore no-explicit-any
  return { status: res.status, body: (await res.json()) as any };
}

Deno.test({ name: "서버 점검: 운영자 키가 있어야 하고, 단계별 결과가 나와요", ...opts, fn: async () => {
  assert((await call("GET", "/admin/diag")).status === 403, "키 없으면 403");
  const r = await call("GET", "/admin/diag", { "x-admin-key": ADMIN });
  assert(r.status === 200, "점검 200");
  for (const k of ["1_ping", "2_transaction_lock", "3_tables", "4_load_world", "5_load_and_save"]) {
    assert(r.body[k]?.ok === true && typeof r.body[k].ms === "number", `${k} 단계 성공 ` + JSON.stringify(r.body[k]));
  }
  assert(r.body.memoryAtStart.rssMB > 0 && r.body.env.HIRO_ADMIN_KEY === true, "메모리와 설정 여부");
  assert(!JSON.stringify(r.body).includes(ADMIN) && !JSON.stringify(r.body).includes("testpw"), "비밀값은 보이지 않아요");
} });

Deno.test({ name: "키 없는 점검(/diag): 단계별 결과만 보이고 내부 설정은 숨겨요, 아무것도 남기지 않아요", ...opts, fn: async () => {
  const [{ before }] = await db()`select count(*)::int as before from users`;
  const r = await call("GET", "/diag");
  assert(r.status === 200, "키 없이 200");
  for (const k of ["1_ping", "2_transaction_lock", "3_tables", "4_load_world", "5_load_and_save", "7_write_probe_rolled_back"]) {
    assert(r.body[k]?.ok === true, `${k} 성공 ` + JSON.stringify(r.body[k]));
  }
  assert(r.body["6_jwks"] && "ok" in r.body["6_jwks"], "jwks 단계가 있어요");
  assert(r.body.env === undefined, "내부 설정 정보는 숨겨요");
  const text = JSON.stringify(r.body);
  assert(!text.includes("testpw") && !text.includes(ADMIN) && !text.includes("localhost"), "비밀값·주소가 보이지 않아요");
  const [{ after }] = await db()`select count(*)::int as after from users`;
  assert(before === after, "점검이 사용자를 남기지 않아요 (되돌림)");
  const [{ n }] = await db()`select count(*)::int as n from users where id = 'u_diagprobe0'`;
  assert(n === 0, "점검용 사용자가 남아 있지 않아요");
} });

Deno.test({ name: "오류 이유는 운영자 키가 있는 요청에만 보여요", ...opts, fn: async () => {
  const uid = crypto.randomUUID();
  const user = { "x-test-auth-id": uid };
  assert((await call("GET", "/state", user)).status === 200, "평소에는 200");
  // 일부러 테이블 이름을 바꿔 오류를 만들어요 (끝나면 되돌려요).
  await db()`alter table ticks rename to ticks_diag_tmp`;
  try {
    const plain = await call("GET", "/state", user);
    assert(plain.status === 500 && plain.body.error && plain.body.detail === undefined, "일반 요청: 500, 이유는 숨김 " + JSON.stringify(plain.body));
    const admin = await call("GET", "/state", { ...user, "x-admin-key": ADMIN });
    assert(admin.status === 500 && String(admin.body.detail).includes("ticks"), "운영자 키가 있으면 이유가 보여요 " + JSON.stringify(admin.body));
    const wrong = await call("GET", "/state", { ...user, "x-admin-key": "nope" });
    assert(wrong.body.detail === undefined, "틀린 키는 숨김");
    const diag = await call("GET", "/admin/diag", { "x-admin-key": ADMIN });
    assert(diag.body["3_tables"].ok === false && diag.body["4_load_world"].ok === false, "점검은 실패한 단계를 알려줘요 " + JSON.stringify(diag.body["4_load_world"]));
  } finally {
    await db()`alter table ticks_diag_tmp rename to ticks`;
  }
  assert((await call("GET", "/state", user)).status === 200, "되돌린 뒤 다시 200");
} });

import postgres from "postgres";

Deno.test({ name: "DB 잠금을 쥔 채 멈춘 연결이 있어도: 요청은 빨리 포기하고, 점검은 죽지 않고 원인을 보여주고, DB가 스스로 정리해요", ...opts, fn: async () => {
  Deno.env.set("HIRO_LOCK_TIMEOUT_MS", "700");
  const WORLD_LOCK = 4_747_001;
  const url = Deno.env.get("HIRO_DB_URL")!;
  const stuck = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const uid = crypto.randomUUID();
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  // 서버 함수가 중간에 꺼진 상황을 흉내 내요: 잠금을 쥔 채 트랜잭션이 열려 있고 아무것도 하지 않아요.
  const holding = stuck.begin(async (t) => {
    await t`select pg_advisory_xact_lock(${WORLD_LOCK})`;
    await gate;
  });
  await new Promise((r) => setTimeout(r, 300));
  try {
    const t0 = performance.now();
    const blocked = await call("GET", "/state", { "x-test-auth-id": uid });
    const waited = performance.now() - t0;
    assert(blocked.status === 500, "잠금이 막혀 있으면 500으로 빨리 포기해요 " + blocked.status);
    assert(waited < 4000, `오래 기다리지 않아요 (${Math.round(waited)}ms)`);
    const t1 = performance.now();
    const diag = await call("GET", "/diag");
    assert(performance.now() - t1 < 15000, "점검은 15초 안에 끝나요");
    assert(diag.status === 200 && diag.body["2_transaction_lock"].ok === false, "막힌 단계를 알려줘요 " + JSON.stringify(diag.body["2_transaction_lock"]));
    assert(diag.body["0_db_activity"].ok && diag.body["0_db_activity"].advisoryLocksHeld >= 1, "열려 있는 잠금이 보여요 " + JSON.stringify(diag.body["0_db_activity"]));
    assert(diag.body["0_db_activity"].sessions.every((x: { query?: string }) => x.query === undefined), "키 없는 점검에는 쿼리 글이 없어요");
  } finally {
    release();
    await holding.catch(() => {});
    await stuck.end({ timeout: 2 });
    Deno.env.delete("HIRO_LOCK_TIMEOUT_MS");
  }
  assert((await call("GET", "/state", { "x-test-auth-id": uid })).status === 200, "잠금이 풀리면 바로 200");
} });

Deno.test({ name: "클라이언트가 사라져 트랜잭션이 열린 채 남으면 DB가 스스로 닫고 잠금이 풀려요", ...opts, fn: async () => {
  const WORLD_LOCK = 4_747_001;
  const url = Deno.env.get("HIRO_DB_URL")!;
  const zombie = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  // 우리 서버 함수의 트랜잭션처럼 idle 제한(1초)을 걸고 잠금을 쥔 뒤, 클라이언트가 응답 없이 멈춘 상황
  const gate = new Promise<void>(() => {}); // 영영 풀리지 않음
  void zombie.begin(async (t) => {
    await t`select set_config('idle_in_transaction_session_timeout', '1000ms', true)`;
    await t`select pg_advisory_xact_lock(${WORLD_LOCK})`;
    await gate;
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  Deno.env.set("HIRO_LOCK_TIMEOUT_MS", "6000");
  try {
    const t0 = performance.now();
    const r = await call("GET", "/state", { "x-test-auth-id": crypto.randomUUID() });
    const took = performance.now() - t0;
    assert(r.status === 200, "DB가 멈춘 트랜잭션을 닫아서 요청이 성공해요 " + r.status);
    assert(took > 500 && took < 5000, `1~2초쯤 기다린 뒤 성공해요 (${Math.round(took)}ms)`);
  } finally {
    Deno.env.delete("HIRO_LOCK_TIMEOUT_MS");
    await zombie.end({ timeout: 1 }).catch(() => {});
  }
} });

Deno.test({ name: "정리", ...opts, fn: async () => {
  await closeDb();
} });
