// 서버 함수에서 도메인 로직 실행하기: 불러오기 → 로직(동기) → 바뀐 것 저장, 한 트랜잭션 안에서
import type { DB } from "../types.ts";
import { runWithWorld } from "../world.ts";
import { type Tx, db, tx, tryTx } from "./db.ts";
import { loadWorld, saveWorld } from "./world-db.ts";

/** fn은 도메인 로직을 부르는 동기 함수예요. 결과를 돌려주고, 바뀐 데이터는 저장돼요. */
export function inWorld<T>(fn: (db: DB) => T): Promise<T> {
  return tx((t) => inWorldTx(t, fn));
}

export async function inWorldTx<T>(t: Tx, fn: (db: DB) => T): Promise<T> {
  const loaded = await loadWorld(t);
  const out = runWithWorld(loaded.db, () => fn(loaded.db));
  await saveWorld(t, loaded);
  return out;
}

/** 다른 요청이 처리 중이면 건너뛰어요 (null). */
export function tryInWorld<T>(fn: (db: DB) => T): Promise<T | null> {
  return tryTx((t) => inWorldTx(t, fn));
}

/** 읽기 전용 모습 (AI 계획용). 잠그지 않아요. */
export async function snapshot(): Promise<DB> {
  return (await loadWorld(db())).db;
}
