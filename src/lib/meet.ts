// 누가 누구와 1:1로 대화할 수 있는지 (대화 그래프)
// 성향 조사의 필수 조건(머리 길이, 히로 컬러 범위·옐로, 문담피)이 서로 맞는 쌍끼리만 대화해요.
// 그룹은 "모두가 모두와"가 아니라, 각자 최소 MIN_PARTNERS명 이상과 대화할 수 있으면 성립해요.
import { compatible } from "./compat";
import type { User } from "./types";

/** 한 그룹 안에서 한 사람이 최소 몇 명과 대화할 수 있어야 하는지 */
export const MIN_PARTNERS = () => Math.max(1, Number(process.env.HIRO_MIN_PARTNERS ?? 2));

export function canMeet(a: User, b: User) {
  return a.id !== b.id && compatible(a, b);
}

/** 그룹 안에서 이 사람과 대화할 수 있는 사람 수 */
export function partnersIn(u: User, group: User[]) {
  let n = 0;
  for (const o of group) if (o !== u && canMeet(u, o)) n++;
  return n;
}

/** 그룹 안에서 대화할 수 있는 쌍의 수 */
export function edgeCount(group: User[]) {
  let n = 0;
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) if (canMeet(group[i], group[j])) n++;
  return n;
}

export function isViable(group: User[], minSize: number) {
  return group.length >= minSize && group.every((u) => partnersIn(u, group) >= MIN_PARTNERS());
}

/** 대화 상대가 모자란 사람을 하나씩 빼서 성립하는 그룹을 만들어요. 안 되면 null */
export function prune(group: User[], minSize: number): User[] | null {
  let g = [...group];
  for (;;) {
    if (g.length < minSize) return null;
    let worst: User | null = null;
    let worstN = Infinity;
    for (const u of g) {
      const n = partnersIn(u, g);
      if (n < MIN_PARTNERS() && n <= worstN) {
        worst = u;
        worstN = n;
      }
    }
    if (!worst) return g;
    g = g.filter((u) => u !== worst);
  }
}

/**
 * 후보 중에서 가장 좋은 그룹 하나를 찾아요.
 * 한 사람씩 시작점으로 삼아, 지금 그룹과 대화할 수 있는 쌍이 가장 많이 늘어나는 사람을 차례로 더한 뒤
 * 대화 상대가 모자란 사람을 빼요. 인원이 많고, 대화 쌍이 많고, (같으면) 앞쪽 사람이 들어간 그룹을 골라요.
 * order: 우선순위 순서 (우선권·대기 시간). score: 추가 가산점 (원하는 성향 궁합 등)
 */
export function bestGroup(order: User[], minSize: number, maxSize: number, score?: (g: User[]) => number): User[] | null {
  let best: User[] | null = null;
  let bestKey = -Infinity;
  const rank = new Map(order.map((u, i) => [u, i]));
  for (let seed = 0; seed < order.length; seed++) {
    const g: User[] = [order[seed]];
    while (g.length < maxSize) {
      let pick: User | null = null;
      let pickGain = 0;
      for (const u of order) {
        if (g.includes(u)) continue;
        const gain = partnersIn(u, g);
        if (gain > pickGain || (gain === pickGain && gain > 0 && pick && rank.get(u)! < rank.get(pick)!)) {
          pick = u;
          pickGain = gain;
        }
      }
      if (!pick) break;
      g.push(pick);
    }
    const p = prune(g, minSize);
    if (!p) continue;
    const key = p.length * 10_000 + edgeCount(p) * 100 + (score ? score(p) : 0) - seed * 0.001;
    if (key > bestKey) {
      best = p;
      bestKey = key;
    }
  }
  return best;
}
