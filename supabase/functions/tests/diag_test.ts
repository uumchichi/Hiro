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

Deno.test({ name: "정리", ...opts, fn: async () => {
  await closeDb();
} });
