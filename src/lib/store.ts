import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

// 프로토타입용 저장소: 메모리 + JSON 파일(.data/hiro-db.json).
// 서버 한 대에서만 동작합니다. 실서비스에서는 Postgres(Supabase 등)로 교체하세요.

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "hiro-db.json");

const g = globalThis as unknown as { __hiroDb?: DB };

function empty(): DB {
  return { users: {}, groups: {}, slots: {}, catalog: null, catalogCursor: 0, lobby: {}, invites: {}, chats: {}, reports: [], ledger: [] };
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
  assignCodes(db); // 예전 데이터에도 공개 ID를 붙여요
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
  assignCodes(db);
  persist(db);
  return result;
}

// ── 공개 ID: 숫자 + 영어 대문자 5글자. 헷갈리는 0/O, 1/I는 뺐어요. ──
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  // 숫자와 영문이 섞이도록
  return /[0-9]/.test(s) && /[A-Z]/.test(s) ? s : randomCode();
}

/** ID가 없는 사용자에게 겹치지 않는 ID를 줍니다 (새 사용자, 예전 데이터 모두). */
function assignCodes(db: DB) {
  let used: Set<string> | null = null;
  for (const u of Object.values(db.users)) {
    if (u.code) continue;
    used ??= new Set(Object.values(db.users).map((x) => x.code).filter(Boolean) as string[]);
    let c = randomCode();
    while (used.has(c)) c = randomCode();
    used.add(c);
    u.code = c;
  }
}

export function normalizeCode(input: string) {
  return input.trim().replace(/^#/, "").toUpperCase();
}

export function resetDb() {
  g.__hiroDb = empty();
  persist(g.__hiroDb);
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}
