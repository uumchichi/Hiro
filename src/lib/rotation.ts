import type { Group, Round } from "./types";

/**
 * 1:1 로테이션 일정을 만듭니다.
 * canMeet이 없거나 모든 쌍이 대화할 수 있으면 원형(라운드 로빈) 방식: 모두가 서로 한 번씩, 홀수면 한 명씩 쉬어요.
 * 대화할 수 없는 쌍이 있으면, 대화할 수 있는 쌍만 한 번씩 만나도록 라운드를 짜요. 상대가 없는 라운드는 쉬어요.
 */
export function buildRotation(memberIds: string[], canMeet?: (a: string, b: string) => boolean): Round[] {
  if (memberIds.length < 2) return [];
  const edges: [string, string][] = [];
  for (let i = 0; i < memberIds.length; i++)
    for (let j = i + 1; j < memberIds.length; j++) if (!canMeet || canMeet(memberIds[i], memberIds[j])) edges.push([memberIds[i], memberIds[j]]);
  const complete = edges.length === (memberIds.length * (memberIds.length - 1)) / 2;
  return complete ? roundRobin(memberIds) : scheduleEdges(memberIds, edges);
}

function roundRobin(memberIds: string[]): Round[] {
  const people: (string | null)[] = [...memberIds];
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

/**
 * 대화할 수 있는 쌍(edges)을 라운드로 나눠요. 남은 상대가 많은 사람부터 먼저 짝지어 라운드 수를 줄여요.
 * 순서를 바꿔 여러 번 시도하고 라운드가 가장 적은 일정을 골라요 (기다리는 시간을 줄이려고).
 */
function scheduleEdges(memberIds: string[], edges: [string, string][]): Round[] {
  let best = scheduleOnce(memberIds, edges);
  const target = Math.max(...memberIds.map((id) => edges.filter((e) => e[0] === id || e[1] === id).length));
  for (let attempt = 0; attempt < 60 && best.length > target; attempt++) {
    const shuffled = [...edges].sort(() => Math.random() - 0.5);
    const r = scheduleOnce(memberIds, shuffled);
    if (r.length < best.length) best = r;
  }
  return best;
}

function scheduleOnce(memberIds: string[], edges: [string, string][]): Round[] {
  const remaining = [...edges];
  const rounds: Round[] = [];
  while (remaining.length) {
    const deg = new Map<string, number>();
    for (const [a, b] of remaining) {
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    const order = remaining
      .map((e, i) => ({ e, i, w: Math.max(deg.get(e[0])!, deg.get(e[1])!) * 100 + deg.get(e[0])! + deg.get(e[1])! }))
      .sort((x, y) => y.w - x.w || x.i - y.i);
    const used = new Set<string>();
    const round: Round = { pairs: [], resting: [] };
    const taken = new Set<number>();
    for (const { e, i } of order) {
      if (used.has(e[0]) || used.has(e[1])) continue;
      used.add(e[0]);
      used.add(e[1]);
      round.pairs.push({ a: e[0], b: e[1] });
      taken.add(i);
    }
    round.resting = memberIds.filter((id) => !used.has(id));
    rounds.push(round);
    for (let i = remaining.length - 1; i >= 0; i--) if (taken.has(i)) remaining.splice(i, 1);
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
