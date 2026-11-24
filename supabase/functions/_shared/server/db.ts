// DB 연결: Supabase가 서버 함수에 넣어 주는 SUPABASE_DB_URL을 써요.
// 모든 요청은 한 트랜잭션 안에서 처리해요. 중간에 실패하면 전부 취소돼요.
import postgres from "postgres";
import { env } from "../env.ts";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

let sql: Sql | null = null;

export function db(): Sql {
  if (!sql) {
    const url = env("HIRO_DB_URL") ?? env("SUPABASE_DB_URL");
    if (!url) throw new Error("SUPABASE_DB_URL is not set");
    // 서버 함수는 짧게 살아서 연결을 적게 써요. prepare=false는 Supabase 연결 풀(트랜잭션 모드)과 맞추기 위해서예요.
    sql = postgres(url, { max: 3, prepare: false, idle_timeout: 20, onnotice: () => {} });
  }
  return sql;
}

// 데이터를 바꾸는 요청은 모두 이 잠금을 잡고 하나씩 처리해요.
// (도메인 로직이 여러 테이블을 한꺼번에 읽고 쓰기 때문에, 중간에 다른 요청이 끼어들면 어긋날 수 있어요.)
const WORLD_LOCK = 4_747_001;

/** 트랜잭션 안에서 실행해요. 전역 잠금을 잡아서 데이터를 바꾸는 다른 요청과 겹치지 않아요. */
export function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return db().begin(async (t) => {
    // 잠금을 오래 기다리거나 쿼리가 오래 걸리면 포기해서, 요청이 쌓여 서버 함수가 자원 한도에 걸리지 않게 해요.
    await t`select set_config('lock_timeout', '20s', true), set_config('statement_timeout', '30s', true)`;
    await t`select pg_advisory_xact_lock(${WORLD_LOCK})`;
    return fn(t);
  }) as Promise<T>;
}

/** 잠금을 기다리지 않고, 다른 요청이 잡고 있으면 null (주기 처리를 여러 요청이 동시에 하지 않도록) */
export function tryTx<T>(fn: (t: Tx) => Promise<T>): Promise<T | null> {
  return db().begin(async (t) => {
    const [r] = await t<{ ok: boolean }[]>`select pg_try_advisory_xact_lock(${WORLD_LOCK}) as ok`;
    if (!r.ok) return null;
    return fn(t);
  }) as Promise<T | null>;
}

export async function closeDb() {
  if (sql) await sql.end({ timeout: 5 });
  sql = null;
}
