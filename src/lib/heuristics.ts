// AI(Claude)를 쓸 수 없을 때(API 키 없음, 오류) 쓰는 규칙 기반 로직.
import { QUESTIONS, TRAIT_LABELS } from "./questions";
import type { Analysis, Theme, TraitKey, TraitScores, User } from "./types";

export const GROUP_MIN = Number(process.env.HIRO_GROUP_MIN ?? 3);
export const GROUP_MAX = Number(process.env.HIRO_GROUP_MAX ?? 6);

export function computeTraits(answers: number[]): TraitScores {
  const sum: Record<TraitKey, number> = { energy: 0, empathy: 0, planning: 0, openness: 0, expression: 0 };
  const cnt: Record<TraitKey, number> = { energy: 0, empathy: 0, planning: 0, openness: 0, expression: 0 };
  QUESTIONS.forEach((q, i) => {
    const raw = Math.min(5, Math.max(1, answers[i] ?? 3));
    const v = q.reverse ? 6 - raw : raw;
    sum[q.trait] += v;
    cnt[q.trait] += 1;
  });
  const out = {} as TraitScores;
  (Object.keys(sum) as TraitKey[]).forEach((k) => {
    out[k] = cnt[k] ? Math.round(((sum[k] / cnt[k] - 1) / 4) * 100) : 50;
  });
  return out;
}

const TYPE_TABLE: Record<TraitKey, { hi: [string, string]; lo: [string, string] }> = {
  energy: { hi: ["햇살 같은", "☀️"], lo: ["잔잔한", "🌙"] },
  empathy: { hi: ["다정한", "🫶"], lo: ["명쾌한", "💎"] },
  planning: { hi: ["꼼꼼한", "🗂️"], lo: ["자유로운", "🎈"] },
  openness: { hi: ["탐험가", "🧭"], lo: ["안식처", "🏡"] },
  expression: { hi: ["직진러", "💌"], lo: ["관찰자", "🔭"] },
};

export function ruleAnalysis(traits: TraitScores, tags: string[]): Analysis {
  const sorted = (Object.keys(traits) as TraitKey[]).sort(
    (a, b) => Math.abs(traits[b] - 50) - Math.abs(traits[a] - 50),
  );
  const [first, second] = sorted;
  const adj = traits[first] >= 50 ? TYPE_TABLE[first].hi : TYPE_TABLE[first].lo;
  const noun = traits[second] >= 50 ? TYPE_TABLE[second].hi : TYPE_TABLE[second].lo;
  const desc = (k: TraitKey) => (traits[k] >= 50 ? TRAIT_LABELS[k].high : TRAIT_LABELS[k].low);
  return {
    typeName: `${adj[0]} ${noun[0]}`,
    emoji: adj[1],
    summary: `${desc("energy")} 에너지에 ${desc("empathy")} 면이 돋보이는 사람이에요. 관계에서는 ${desc(
      "planning",
    )} 편이고, ${desc("openness")} 성향이 있어요.`,
    strengths: [`${desc(first)} 매력`, `${desc(second)} 태도`, tags[0] ? `${tags[0]} 이야기로 금방 가까워짐` : "편안한 대화"],
    conversationTips: [
      traits.energy >= 50 ? "상대가 말할 틈을 한 번 더 남겨 주세요" : "첫 질문을 미리 하나 준비해 가면 편해요",
      traits.expression >= 50 ? "솔직함에 다정한 한마디를 더해 보세요" : "좋았던 점은 짧게라도 꼭 말로 표현해 보세요",
    ],
    idealMatch: traits.empathy >= 50 ? "이야기를 끝까지 들어주는 차분한 사람" : "생각을 나누며 자극을 주는 대화 상대",
    traits,
    source: "rule",
  };
}

/** 대기자들의 태그 빈도로 테마를 고릅니다. */
export function ruleThemes(users: User[], maxThemes = 4): Theme[] {
  const freq = new Map<string, number>();
  for (const u of users) for (const t of u.profile?.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = [...freq.entries()]
    .filter(([, n]) => n >= GROUP_MIN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxThemes);
  const themes: Theme[] = top.map(([tag], i) => ({
    id: `t${i + 1}`,
    title: `${tag} 모여라`,
    emoji: "✨",
    description: `'${tag}' 태그를 가진 분들이 모이는 방이에요.`,
    tags: [tag],
  }));
  themes.push({
    id: `t${themes.length + 1}`,
    title: "취향 탐색 믹스",
    emoji: "🎲",
    description: "다양한 취향을 가진 분들이 섞여 새로운 사람을 만나요.",
    tags: [],
  });
  return themes;
}

/** 각 사람을 태그가 가장 많이 겹치는 테마에 넣고, 최대 인원 기준으로 나눕니다. */
export function ruleGroups(users: User[], themes: Theme[]) {
  const buckets = new Map<string, User[]>();
  const fallback = themes[themes.length - 1];
  for (const u of users) {
    const tags = new Set(u.profile?.tags ?? []);
    let best = fallback;
    let bestScore = 0;
    for (const t of themes) {
      const s = t.tags.filter((x) => tags.has(x)).length;
      if (s > bestScore) {
        best = t;
        bestScore = s;
      }
    }
    if (!buckets.has(best.id)) buckets.set(best.id, []);
    buckets.get(best.id)!.push(u);
  }
  // 최소 인원이 안 되는 버킷은 믹스 테마로 합치기
  for (const [id, list] of [...buckets.entries()]) {
    if (id !== fallback.id && list.length < GROUP_MIN) {
      buckets.delete(id);
      if (!buckets.has(fallback.id)) buckets.set(fallback.id, []);
      buckets.get(fallback.id)!.push(...list);
    }
  }
  const groups: { themeId: string; memberIds: string[]; reason: string; icebreakers: string[] }[] = [];
  const split = (themeId: string, list: User[]): User[] => {
    const theme = themes.find((t) => t.id === themeId)!;
    // 성향이 비슷한 사람끼리 이웃하도록 에너지 점수로 정렬
    list.sort((a, b) => (a.analysis?.traits.energy ?? 50) - (b.analysis?.traits.energy ?? 50));
    let n = Math.ceil(list.length / GROUP_MAX);
    if (list.length < n * GROUP_MIN) n = Math.floor(list.length / GROUP_MIN);
    if (n === 0) return list;
    const placed = list.slice(0, Math.min(list.length, n * GROUP_MAX));
    const chunks: User[][] = Array.from({ length: n }, () => []);
    placed.forEach((u, i) => chunks[i % n].push(u));
    for (const c of chunks) {
      groups.push({
        themeId,
        memberIds: c.map((u) => u.id),
        reason: `'${theme.title}' 테마와 취향이 맞는 분들이에요.`,
        icebreakers: defaultIcebreakers(theme),
      });
    }
    return list.slice(placed.length); // 남은 사람
  };
  // 테마 버킷을 먼저 나누고, 남는 사람은 믹스 테마로 보냅니다.
  const leftovers: User[] = [];
  for (const [themeId, list] of buckets) if (themeId !== fallback.id) leftovers.push(...split(themeId, list));
  const unmatched = split(fallback.id, [...(buckets.get(fallback.id) ?? []), ...leftovers]).map((u) => u.id);
  return { groups, unmatched };
}

export function defaultIcebreakers(theme: Theme): string[] {
  const tag = theme.tags[0];
  return [
    tag ? `'${tag}'와 관련해 가장 기억에 남는 순간은?` : "요즘 가장 빠져 있는 건 뭐예요?",
    "주말을 완벽하게 보내는 방법을 알려 주세요.",
    "최근에 누군가에게 고마웠던 일이 있나요?",
  ];
}
