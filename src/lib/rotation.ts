import type { Group, Round } from "./types";

/**
 * 원형(라운드 로빈) 방식으로 1:1 로테이션 일정을 만듭니다.
 * n명이면 모든 사람이 서로 한 번씩 만나며, 홀수일 때는 라운드마다 한 명이 쉽니다.
 */
export function buildRotation(memberIds: string[]): Round[] {
  const people: (string | null)[] = [...memberIds];
  if (people.length < 2) return [];
  if (people.length % 2 === 1) people.push(null);
  const m = people.length;
  const rounds: Round[] = [];
  for (let r = 0; r < m - 1; r++) {
    const round: Round = { pairs: [], resting: [] };
    for (let i = 0; i < m / 2; i++) {
      const a = people[i];
      const b = people[m - 1 - i];
      if (a && b) round.pairs.push({ a, b });
      else if (a) round.resting.push(a);
      else if (b) round.resting.push(b);
    }
    rounds.push(round);
    // 첫 자리를 고정하고 나머지를 한 칸씩 회전
    const last = people.pop()!;
    people.splice(1, 0, last);
  }
  return rounds;
}

export type Phase =
  | { kind: "not_started" }
  | { kind: "talk"; round: number; endsAt: number }
  | { kind: "break"; nextRound: number; endsAt: number }
  | { kind: "finished" };

/** 시작 시각과 현재 시각으로 지금이 몇 번째 라운드인지 계산합니다. */
export function currentPhase(group: Group, now = Date.now()): Phase {
  if (!group.startedAt) return { kind: "not_started" };
  const slot = group.roundSeconds + group.breakSeconds;
  const elapsed = (now - group.startedAt) / 1000;
  const total = group.rounds.length;
  if (elapsed < 0) return { kind: "not_started" };
  const idx = Math.floor(elapsed / slot);
  if (idx >= total) return { kind: "finished" };
  const within = elapsed - idx * slot;
  const slotStart = group.startedAt + idx * slot * 1000;
  if (within < group.roundSeconds) {
    return { kind: "talk", round: idx, endsAt: slotStart + group.roundSeconds * 1000 };
  }
  if (idx + 1 >= total) return { kind: "finished" };
  return { kind: "break", nextRound: idx + 1, endsAt: slotStart + slot * 1000 };
}

export function partnerIn(group: Group, round: number, userId: string): string | null {
  const r = group.rounds[round];
  if (!r) return null;
  for (const p of r.pairs) {
    if (p.a === userId) return p.b;
    if (p.b === userId) return p.a;
  }
  return null;
}

export function roomName(groupId: string, round: number, a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `hiro-${groupId}-r${round + 1}-${x.slice(-4)}${y.slice(-4)}`;
}
