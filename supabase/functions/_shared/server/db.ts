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

/** 트랜잭션 안에서 실행해요. 동시에 같은 행을 바꾸는 요청은 행 잠금으로 차례를 기다려요. */
export function tx<T>(fn: (t: Tx) => Promise<T>): Promise<T> {
  return db().begin((t) => fn(t)) as Promise<T>;
}

export async function closeDb() {
  if (sql) await sql.end({ timeout: 5 });
  sql = null;
}
