// 도메인 로직(대기실·초대장·그룹·쪽지·직진·지갑)이 데이터를 읽고 쓰는 곳.
// · Next 앱: store.ts가 파일/Postgres 저장소를 연결해요 (setWorldProvider).
// · 서버 함수: 요청마다 DB 테이블에서 불러온 데이터를 runWithWorld()로 잠깐 연결해요.
//   도메인 로직은 동기 함수라서, 연결한 동안 다른 요청이 끼어들 수 없어요.
import type { DB } from "./types.ts";

export interface WorldProvider {
  readDb(): DB;
  mutate<T>(fn: (db: DB) => T): T;
}

let provider: WorldProvider | null = null;
let current: DB | null = null;

export function setWorldProvider(p: WorldProvider) {
  provider = p;
}

/** db를 연결한 채로 fn을 실행해요. fn은 동기 함수여야 해요 (Promise를 돌려주면 오류). */
export function runWithWorld<T>(db: DB, fn: () => T): T {
  if (current) throw new Error("runWithWorld: nested call");
  current = db;
  try {
    const out = fn();
    if (out instanceof Promise) throw new Error("runWithWorld: fn must be synchronous");
    return out;
  } finally {
    current = null;
  }
}

export function readDb(): DB {
  if (current) return current;
  if (provider) return provider.readDb();
  throw new Error("world is not connected");
}

export function mutate<T>(fn: (db: DB) => T): T {
  if (current) return fn(current);
  if (provider) return provider.mutate(fn);
  throw new Error("world is not connected");
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function normalizeCode(input: string) {
  return input.trim().replace(/^#/, "").toUpperCase();
}

export function emptyDb(): DB {
  return { users: {}, groups: {}, slots: {}, catalog: null, catalogCursor: 0, lobby: {}, invites: {}, chats: {}, reports: [], ledger: [] };
}
