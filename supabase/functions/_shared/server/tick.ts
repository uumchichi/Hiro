// 주기 처리: 끝난 로테이션 마무리, 직진 만료, 오래된 채팅 정리, 이벤트 세션 시작, 초대장 만들기·마감.
// 화면이 상태를 물어볼 때(대기실·상태)와 1분마다 도는 예약 작업에서 불러요.
// 여러 요청이 동시에 불러도 한 번만 돌도록, DB의 시각 기록으로 간격을 지켜요.
import type { Invite } from "../types.ts";
import { type InviteJob, commitInvite, lobbyTick, planInvite } from "../lobby.ts";
import { purgeExpired } from "../notes.ts";
import { type SlotJob, commitSlot, planSlot, slotsTick } from "../slots.ts";
import { syncAllGroups } from "../state.ts";
import { db } from "./db.ts";
import { inWorld, snapshot, tryInWorld } from "./world-tx.ts";

const MIN_GAP_MS = 2_000;

/** 지난 처리 후 MIN_GAP_MS가 지났으면 이번 요청이 맡아요 (원자적으로 한 요청만 true). */
async function claimTick(force: boolean): Promise<boolean> {
  if (force) return true;
  const rows = await db()`
    insert into ticks (key, at) values ('world', now())
    on conflict (key) do update set at = now()
    where ticks.at < now() - make_interval(secs => ${MIN_GAP_MS / 1000})
    returning key`;
  return rows.length > 0;
}

export interface TickResult {
  ran: boolean;
  invites: string[];
  slots: string[];
}

/**
 * 한 번 돌아요. 계획(AI)은 잠금 밖에서 해서, 그동안 다른 요청을 막지 않아요.
 * force: 간격을 무시하고 돌아요 (운영자·테스트). forceInvite: 인원이 덜 모였어도 초대장 만들기.
 */
export async function runTick(opts: { force?: boolean; forceInvite?: Invite["kind"]; now?: number } = {}): Promise<TickResult> {
  const result: TickResult = { ran: false, invites: [], slots: [] };
  if (!(await claimTick(Boolean(opts.force || opts.forceInvite)))) return result;
  const now = opts.now ?? Date.now();
  const jobs = await (opts.force || opts.forceInvite ? inWorld : tryInWorld)(() => {
    syncAllGroups(); // 끝난 로테이션 마무리 (남은 입장권 돌려주기 포함)
    purgeExpired(now); // 직진 만료·데모 응답, 지난 채팅·오래된 리포트 정리
    const slotJobs = slotsTick(now);
    const inviteJobs = lobbyTick(now, opts.forceInvite);
    return { slotJobs, inviteJobs };
  });
  if (!jobs) return result; // 다른 요청이 처리 중
  result.ran = true;
  if (!jobs.slotJobs.length && !jobs.inviteJobs.length) return result;

  const snap = await snapshot();
  for (const job of jobs.slotJobs) {
    const id = await formSlot(job, snap);
    if (id) result.slots.push(id);
  }
  for (const job of jobs.inviteJobs) {
    const id = await makeInvite(job, snap);
    if (id) result.invites.push(id);
  }
  return result;
}

async function formSlot(job: SlotJob, snap: Awaited<ReturnType<typeof snapshot>>) {
  try {
    const plan = await planSlot(snap, job);
    await inWorld(() => commitSlot(job, plan));
    return job.slotId;
  } catch (err) {
    // 실패하면 세션은 'forming'으로 남고, 2분 뒤 주기 처리가 규칙으로 나눠요.
    console.error("[tick] formSlot failed", job.slotId, err);
    return null;
  }
}

async function makeInvite(job: InviteJob, snap: Awaited<ReturnType<typeof snapshot>>) {
  try {
    const plan = await planInvite(snap, job);
    if (!plan) return null;
    return await inWorld(() => commitInvite(job, plan));
  } catch (err) {
    console.error("[tick] invite failed", job.kind, err);
    return null;
  }
}

/** 서버 함수가 응답한 뒤에도 하던 일을 마치게 해요 (Supabase EdgeRuntime). 없으면 그냥 기다려요. */
export async function background(p: Promise<unknown>) {
  const rt = (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  const safe = p.catch((err) => console.error("[tick] background failed", err));
  if (rt?.waitUntil) rt.waitUntil(safe);
  else await safe;
}
