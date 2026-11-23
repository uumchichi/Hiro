import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

// 프로토타입용 저장소: 메모리 + JSON 파일(.data/hiro-db.json).
// 서버 한 대에서만 동작합니다. 실서비스에서는 Postgres(Supabase 등)로 교체하세요.

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "hiro-db.json");

const g = globalThis as unknown as { __hiroDb?: DB };

function empty(): DB {
  return { users: {}, groups: {}, slots: {}, catalog: null, catalogCursor: 0, lobby: {}, invites: {} };
}

function load(): DB {
  if (g.__hiroDb) return g.__hiroDb;
  let db = empty();
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = { ...empty(), ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
    }
  } catch (err) {
    console.error("[store] failed to read data file, starting empty", err);
  }
  g.__hiroDb = db;
  return db;
}

function persist(db: DB) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error("[store] failed to persist", err);
  }
}

export function readDb(): DB {
  return load();
}

/** DB를 수정하고 저장합니다. fn 안에서 db 객체를 직접 바꾸세요. */
export function mutate<T>(fn: (db: DB) => T): T {
  const db = load();
  const result = fn(db);
  persist(db);
  return result;
}

export function resetDb() {
  g.__hiroDb = empty();
  persist(g.__hiroDb);
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
