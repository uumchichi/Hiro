import { setWorldProvider } from "../../supabase/functions/_shared/world.ts";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./types";

// 저장소
// · 기본(로컬): 메모리 + JSON 파일 (HIRO_DATA_DIR, 기본 .data/hiro-db.json)
// · DATABASE_URL이 있으면: 메모리 + Postgres(Supabase). 서버가 켜질 때 한 번 불러오고, 바뀔 때마다 저장해요.
//
// 어느 쪽이든 서버(프로세스) 한 대가 데이터의 주인이에요. 매칭·입장권 로직은 메모리에서 바로 처리하고,
// 저장은 뒤에서 차례로 해요. 서버를 여러 대 띄우면 안 돼요(Postgres 모드에서는 나중에 뜬 서버가 주인이 되고,
// 먼저 뜬 서버는 저장을 멈춰요).

const DATA_DIR = process.env.HIRO_DATA_DIR || path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "hiro-db.json");
const PG_URL = process.env.DATABASE_URL;
export const STORE_KIND: "postgres" | "file" = PG_URL ? "postgres" : "file";

type PgState = {
  sql: import("postgres").Sql;
  owner: string;
  saving: Promise<void> | null;
  pending: boolean;
  lostOwnership: boolean;
  lastSavedAt: number;
};

const g = globalThis as unknown as { __hiroDb?: DB; __hiroPg?: PgState; __hiroInit?: Promise<void> };

function empty(): DB {
  return { users: {}, groups: {}, slots: {}, catalog: null, catalogCursor: 0, lobby: {}, invites: {}, chats: {}, reports: [], ledger: [] };
}

function normalize(raw: unknown): DB {
  // 예전 버그로 문자열로 저장된 데이터도 읽어요.
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  const db = { ...empty(), ...(value as Partial<DB>) };
  assignCodes(db); // 예전 데이터에도 공개 ID를 붙여요
  return db;
}

// ───────────── 시작할 때 불러오기 ─────────────

/**
 * 서버가 켜질 때 한 번 불러와요 (instrumentation.ts에서 호출).
 * Postgres 모드에서는 이게 끝나야 요청을 받을 수 있어요.
 */
export function initStore(): Promise<void> {
  g.__hiroInit ??= (async () => {
    if (!PG_URL) {
      load();
      return;
    }
    const { default: postgres } = await import("postgres");
    // Supabase 연결 풀(pooler)과도 잘 동작하도록 prepare를 꺼요.
    const sql = postgres(PG_URL, { max: 3, prepare: false, idle_timeout: 30, connect_timeout: 15 });
    await sql`
      create table if not exists hiro_state (
        id int primary key,
        data jsonb not null,
        version bigint not null default 0,
        owner text,
        updated_at timestamptz not null default now()
      )`;
    const owner = `${process.env.HOSTNAME ?? "server"}-${process.pid}-${Date.now().toString(36)}`;
    // 이 서버가 주인이 돼요. 행이 없으면 빈 데이터로 만들어요.
    const rows = await sql<{ data: unknown }[]>`
      insert into hiro_state (id, data, version, owner) values (1, ${sql.json(empty() as never)}, 0, ${owner})
      on conflict (id) do update set owner = excluded.owner, updated_at = now()
      returning data`;
    g.__hiroDb = normalize(rows[0].data);
    g.__hiroPg = { sql, owner, saving: null, pending: false, lostOwnership: false, lastSavedAt: Date.now() };
    console.log(`[store] loaded from Postgres (${Object.keys(g.__hiroDb.users).length} users), owner=${owner}`);

    // 서버가 꺼질 때 마지막 변경을 저장해요.
    const shutdown = async () => {
      await flushStore().catch(() => {});
      process.exit(0);
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  })();
  return g.__hiroInit;
}

function load(): DB {
  if (g.__hiroDb) return g.__hiroDb;
  if (PG_URL) throw new Error("[store] Postgres 저장소가 아직 준비되지 않았어요. initStore()가 먼저 실행돼야 해요.");
  let db = empty();
  try {
    if (fs.existsSync(DATA_FILE)) db = normalize(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch (err) {
    console.error("[store] failed to read data file, starting empty", err);
  }
  assignCodes(db);
  g.__hiroDb = db;
  return db;
}

// ───────────── 저장 ─────────────

function persist(db: DB) {
  if (PG_URL) {
    schedulePgSave();
    return;
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error("[store] failed to persist", err);
  }
}

/** 저장이 진행 중이면 '한 번 더'만 표시하고, 끝나면 가장 최신 상태를 한 번 더 저장해요. */
function schedulePgSave() {
  const pg = g.__hiroPg;
  if (!pg || pg.lostOwnership) return;
  if (pg.saving) {
    pg.pending = true;
    return;
  }
  pg.saving = (async () => {
    do {
      pg.pending = false;
      // 지금 상태를 복사해서 저장해요 (저장 중에 바뀌어도 섞이지 않게). 문자열이 아니라 JSON 객체로 넣어야 해요.
      const snapshot = JSON.parse(JSON.stringify(g.__hiroDb));
      try {
        const res = await pg.sql`
          update hiro_state set data = ${pg.sql.json(snapshot)}, version = version + 1, updated_at = now()
          where id = 1 and owner = ${pg.owner}`;
        if (res.count === 0) {
          pg.lostOwnership = true;
          console.error("[store] 다른 서버가 데이터의 주인이 됐어요. 이 서버는 더 이상 저장하지 않아요. 서버가 두 대 떠 있지 않은지 확인하세요.");
          return;
        }
        pg.lastSavedAt = Date.now();
      } catch (err) {
        // 일시적인 연결 오류: 잠깐 쉬고 다시 시도해요 (최신 상태로).
        console.error("[store] Postgres save failed, retrying", err);
        pg.pending = true;
        await new Promise((r) => setTimeout(r, 1000));
      }
    } while (pg.pending);
  })().finally(() => {
    pg.saving = null;
  });
}

/** 남은 저장을 모두 끝낼 때까지 기다려요 (종료 직전, 테스트). */
export async function flushStore() {
  const pg = g.__hiroPg;
  while (pg?.saving) await pg.saving;
}

export function storeStatus() {
  const pg = g.__hiroPg;
  return {
    kind: STORE_KIND,
    ready: Boolean(g.__hiroDb),
    saving: Boolean(pg?.saving),
    lostOwnership: Boolean(pg?.lostOwnership),
    lastSavedAt: pg?.lastSavedAt ?? null,
  };
}

// ───────────── 읽기 · 쓰기 ─────────────

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

export { newId } from "../../supabase/functions/_shared/world.ts";

// 공용 도메인 로직(대기실·초대장·그룹·쪽지·지갑)이 이 저장소를 쓰도록 연결해요.
setWorldProvider({ readDb, mutate });
