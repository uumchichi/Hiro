// 그룹 만들기 (테마 세션과 AI 초대장이 함께 씁니다)
import { defaultIcebreakers } from "./heuristics";
import { canMeet } from "./meet";
import { hold } from "./wallet";
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
    // 성향 조사에서 서로 원하는 쌍끼리만 대화하도록 일정을 짜요.
    rounds: buildRotation(opts.memberIds, (a, b) => canMeet(db.users[a], db.users[b])),
    roundSeconds: opts.roundSeconds ?? ROUND_SECONDS(),
    breakSeconds: BREAK_SECONDS(),
    startedAt: Date.now() + opts.startInMs,
    letters: {},
    memos: {},
    reveals: {},
  };
  db.groups[group.id] = group;
  for (const id of opts.memberIds) {
    // 입장권은 맡아 두기만 해요. 첫 1:1 대화가 이어지면 차감되고, 성사되지 않으면 끝날 때 돌려줘요.
    if (!hold(db, id, "ticket", `group:${group.id}`, `'${group.theme.title}' 로테이션 입장권 맡김`)) {
      console.warn("[groups] no ticket to hold for", id);
    }
    db.users[id].status = "grouped";
    db.users[id].groupId = group.id;
    delete db.lobby?.[id]; // 그룹에 들어가면 대기실에서 나갑니다.
  }
  return group;
}
