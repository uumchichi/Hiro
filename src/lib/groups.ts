// 그룹 만들기 (테마 세션과 AI 초대장이 함께 씁니다)
import { defaultIcebreakers } from "./heuristics";
import { buildRotation } from "./rotation";
import { newId } from "./store";
import type { DB, Group, Theme } from "./types";

export const ROUND_SECONDS = () => Number(process.env.HIRO_ROUND_SECONDS ?? 300);
export const BREAK_SECONDS = () => Number(process.env.HIRO_BREAK_SECONDS ?? 20);

/** mutate() 안에서 호출하세요. 멤버들을 그룹에 넣고 로테이션을 예약합니다. */
export function createGroup(
  db: DB,
  opts: { theme: Theme; memberIds: string[]; reason: string; startInMs: number; roundSeconds?: number },
): Group {
  const group: Group = {
    id: newId("g"),
    createdAt: Date.now(),
    theme: opts.theme,
    memberIds: opts.memberIds,
    reason: opts.reason,
    icebreakers: opts.theme.icebreakers?.length ? opts.theme.icebreakers : defaultIcebreakers(opts.theme),
    status: "live",
    rounds: buildRotation(opts.memberIds),
    roundSeconds: opts.roundSeconds ?? ROUND_SECONDS(),
    breakSeconds: BREAK_SECONDS(),
    startedAt: Date.now() + opts.startInMs,
    choices: {},
    submitted: [],
  };
  db.groups[group.id] = group;
  for (const id of opts.memberIds) {
    db.users[id].status = "grouped";
    db.users[id].groupId = group.id;
    delete db.lobby?.[id]; // 그룹에 들어가면 대기실에서 나갑니다.
  }
  return group;
}
