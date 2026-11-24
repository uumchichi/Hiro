// 서버 점검: 어디서 얼마나 걸리고 어디서 실패하는지 한 번에 보여줘요 (운영자 전용, 비밀값은 보여주지 않아요).
import { env } from "../env.ts";
import { db, tx } from "./db.ts";
import { loadWorld, saveWorld } from "./world-db.ts";
import { inWorld } from "./world-tx.ts";

// deno-lint-ignore no-explicit-any
export function describeError(err: any): string {
  const parts = [`${err?.name ?? "Error"}: ${err?.message ?? String(err)}`];
  if (err?.code) parts.push(`code=${err.code}`);
  if (err?.detail) parts.push(`detail=${err.detail}`);
  if (err?.hint) parts.push(`hint=${err.hint}`);
  if (err?.stack) parts.push(String(err.stack).split("\n").slice(1, 6).join(" | "));
  return parts.join(" · ").slice(0, 1200);
}

const mb = (n: number) => Math.round(n / 1e5) / 10;

function memory() {
  const m = Deno.memoryUsage();
  return { rssMB: mb(m.rss), heapUsedMB: mb(m.heapUsed), heapTotalMB: mb(m.heapTotal), externalMB: mb(m.external) };
}

function dbTarget() {
  const raw = env("HIRO_DB_URL") ?? env("SUPABASE_DB_URL");
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { host: u.hostname, port: u.port, user: u.username, database: u.pathname.slice(1), sslmode: u.searchParams.get("sslmode") };
  } catch {
    return "해석할 수 없는 주소";
  }
}

class Rollback extends Error {}

/** publicView: 키 없이 여는 점검용. 설정 여부·DB 주소 같은 내부 정보는 빼고, 단계별 결과만 보여줘요. */
export async function runDiag(publicView = false) {
  const out: Record<string, unknown> = {
    time: new Date().toISOString(),
    deno: Deno.version.deno,
    memoryAtStart: memory(),
    env: publicView ? undefined : {
      SUPABASE_URL: Boolean(env("SUPABASE_URL")),
      SUPABASE_DB_URL: dbTarget(),
      HIRO_ADMIN_KEY: Boolean(env("HIRO_ADMIN_KEY")),
      HIRO_CRON_KEY: Boolean(env("HIRO_CRON_KEY")),
      ANTHROPIC_API_KEY: Boolean(env("ANTHROPIC_API_KEY")),
      LIVEKIT: Boolean(env("LIVEKIT_API_KEY")),
    },
  };
  // 단계마다 시간·메모리를 재고, 실패해도 다음 단계로 넘어가요.
  async function stage(name: string, fn: () => Promise<Record<string, unknown> | void>) {
    const t0 = performance.now();
    try {
      const extra = (await fn()) ?? {};
      out[name] = { ok: true, ms: Math.round(performance.now() - t0), rssMB: mb(Deno.memoryUsage().rss), ...extra };
    } catch (err) {
      out[name] = { ok: false, ms: Math.round(performance.now() - t0), error: describeError(err) };
    }
  }
  await stage("1_ping", async () => {
    await db()`select 1`;
  });
  await stage("2_transaction_lock", () => tx(async (t) => void (await t`select 1`)));
  await stage("3_tables", async () => {
    const [r] = await db()<Record<string, number>[]>`
      select (select count(*) from users)::int as users, (select count(*) from wallets)::int as wallets,
        (select count(*) from groups)::int as groups, (select count(*) from slots)::int as slots,
        (select count(*) from ledger)::int as ledger, (select count(*) from ticks)::int as ticks`;
    return r;
  });
  await stage("4_load_world", () =>
    tx(async (t) => {
      const { db: world } = await loadWorld(t);
      return { users: Object.keys(world.users).length, groups: Object.keys(world.groups).length, slots: Object.keys(world.slots).length };
    }));
  await stage("5_load_and_save", async () => {
    await inWorld(() => null);
  });
  // 로그인 확인에 쓰는 Supabase 공개키 목록 (공개 정보)
  await stage("6_jwks", async () => {
    const base = env("SUPABASE_URL");
    if (!base) throw new Error("SUPABASE_URL 이 없어요");
    const r = await fetch(`${base}/auth/v1/.well-known/jwks.json`);
    const j = await r.json().catch(() => null);
    return { httpStatus: r.status, keyCount: j?.keys?.length ?? 0, algs: (j?.keys ?? []).map((k: { alg?: string }) => k.alg) };
  });
  // 새 사용자를 저장하는 길을 그대로 지나가 보고, 마지막에 되돌려요 (아무것도 남지 않아요).
  await stage("7_write_probe_rolled_back", async () => {
    try {
      await tx(async (t) => {
        const loaded = await loadWorld(t);
        loaded.db.users["u_diagprobe0"] = { id: "u_diagprobe0", createdAt: Date.now(), isDemo: false, status: "new" };
        await saveWorld(t, loaded);
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
  });
  out.memoryAtEnd = memory();
  return out;
}
