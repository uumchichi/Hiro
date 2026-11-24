// 그룹 만들기 (테마 세션과 AI 초대장이 함께 씁니다)
import { defaultIcebreakers } from "./heuristics";
import { GROUP_MIN } from "./heuristics";
import { canMeet, prune } from "./meet";
import { hold, release } from "./wallet";
import { buildRotation } from "./rotation";
import { newId } from "./store";
import type { DB, Group, Theme } from "./types";

export const ROUND_SECONDS = () => Number(process.env.HIRO_ROUND_SECONDS ?? 300);
export const BREAK_SECONDS = () => Number(process.env.HIRO_BREAK_SECONDS ?? 20);

/**
 * mutate() 안에서 호출하세요. 멤버들을 그룹에 넣고 로테이션을 예약합니다.
 * 먼저 모두의 입장권을 맡겨 보고(없으면 자동 교환), 맡기지 못한 사람은 빼요.
 * 뺀 뒤 그룹이 성립하지 않으면(인원 부족, 대화 상대 부족) 맡긴 입장권을 모두 돌려주고 null을 돌려줘요.
 */
export function createGroup(
  db: DB,
  opts: { theme: Theme; memberIds: string[]; reason: string; startInMs: number; roundSeconds?: number },
): Group | null {
  const id = newId("g");
  const ref = `group:${id}`;
  const ok = opts.memberIds.filter((uid) => hold(db, uid, "ticket", ref, `'${opts.theme.title}' 로테이션 입장권 맡김`));
  const viable = prune(
    ok.map((uid) => db.users[uid]),
    Math.min(GROUP_MIN, opts.memberIds.length),
  );
  if (!viable) {
    for (const uid of ok) release(db, uid, ref, `'${opts.theme.title}' 그룹이 성립하지 않아 입장권을 돌려드렸어요`);
    return null;
  }
  const members = viable.map((u) => u.id);
  for (const uid of ok) if (!members.includes(uid)) release(db, uid, ref, `'${opts.theme.title}' 그룹에서 빠져 입장권을 돌려드렸어요`);

  const group: Group = {
    id,
    createdAt: Date.now(),
    theme: opts.theme,
    memberIds: members,
    reason: opts.reason,
    icebreakers: opts.theme.icebreakers?.length ? opts.theme.icebreakers : defaultIcebreakers(opts.theme),
    status: "live",
    // 성향 조사에서 서로 원하는 쌍끼리만 대화하도록 일정을 짜요.
    rounds: buildRotation(members, (a, b) => canMeet(db.users[a], db.users[b])),
    roundSeconds: opts.roundSeconds ?? ROUND_SECONDS(),
    breakSeconds: BREAK_SECONDS(),
    startedAt: Date.now() + opts.startInMs,
    letters: {},
    memos: {},
    reveals: {},
  };
  db.groups[group.id] = group;
  for (const uid of members) {
    db.users[uid].status = "grouped";
    db.users[uid].groupId = group.id;
    delete db.lobby?.[uid]; // 그룹에 들어가면 대기실에서 나갑니다.
  }
  return group;
}
