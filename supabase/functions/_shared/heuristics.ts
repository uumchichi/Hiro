import { env } from "./env.ts";
// AI(Claude)를 쓸 수 없을 때(API 키 없음, 오류) 쓰는 규칙 기반 로직.
import { MIN_PARTNERS, bestGroup, canMeet, partnersIn, prune } from "./meet.ts";
import { QUESTIONS, TRAIT_LABELS } from "./questions.ts";
import type { Analysis, PartnerWants, Theme, TraitKey, TraitScores, User } from "./types.ts";

export const GROUP_MIN = Number(env("HIRO_GROUP_MIN") ?? 4);
export const GROUP_MAX = Number(env("HIRO_GROUP_MAX") ?? 6);

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

// 기본 테마 목록. AI 테마 에이전트를 쓸 수 없을 때, 그리고 처음 시작할 때 씁니다.
const BASE_THEMES: Omit<Theme, "id">[] = [
  { title: "고양이 집사들의 수다", emoji: "🐈", description: "우리 집 고양이 자랑부터 집사 고민까지.", tags: ["고양이 집사"] },
  { title: "매운 거 못 먹는 사람들", emoji: "🌶️", description: "맵찔이끼리라면 메뉴 고민 끝!", tags: ["맵찔이"] },
  { title: "교회 다니는 사람들", emoji: "⛪", description: "신앙을 나눌 수 있는 사람을 만나요.", tags: ["기독교"] },
  { title: "술 없이도 즐거운 밤", emoji: "🧃", description: "술 안 마셔도 대화가 즐거운 사람들.", tags: ["술 안 마셔요"] },
  { title: "책 이야기 나누기", emoji: "📚", description: "최근에 읽은 책 한 권으로 시작해요.", tags: ["독서"] },
  { title: "운동하는 여자들", emoji: "🏃‍♀️", description: "러닝, 요가, 헬스까지 몸 쓰는 이야기.", tags: ["운동", "러닝", "요가/필라테스"] },
  { title: "집순이 모임", emoji: "🛋️", description: "집에서 보내는 완벽한 주말을 공유해요.", tags: ["집순이"] },
  { title: "여행 좋아하는 사람", emoji: "✈️", description: "다음 여행지를 같이 꿈꿔요.", tags: ["여행"] },
  { title: "덕질은 나의 힘", emoji: "💿", description: "무엇이든 좋아하는 마음을 나눠요.", tags: ["덕질", "게임", "영화"] },
  { title: "취향 탐색 믹스", emoji: "🎲", description: "다양한 취향의 사람들이 섞여 새로운 사람을 만나요.", tags: [] },
];

export function ruleCatalog(): Theme[] {
  return BASE_THEMES.map((t, i) => ({ ...t, id: `base${i + 1}`, icebreakers: defaultIcebreakers(t) }));
}

/**
 * 한 세션에 모인 사람들을 GROUP_MIN~GROUP_MAX명 그룹으로 나눕니다.
 * 그룹 안에서는 서로 원하는 쌍끼리만 1:1로 대화하고, 각자 최소 MIN_PARTNERS명과 대화할 수 있어야 해요.
 * 대화할 수 있는 쌍이 많고, 원하는 상대 성향이 잘 맞도록 배정해요.
 */
export function balancedPack(list: User[]): { chunks: User[][]; leftovers: User[] } {
  // 이번 세션에서 대화 상대가 모자란 사람은 미리 빼요.
  const hopeless = list.filter((u) => partnersIn(u, list) < MIN_PARTNERS());
  const pool = list.filter((u) => !hopeless.includes(u));
  if (pool.length < GROUP_MIN) return { chunks: [], leftovers: list };

  const n = Math.ceil(pool.length / GROUP_MAX);
  const target = Math.max(GROUP_MIN, Math.ceil(pool.length / n));
  // 대화 상대가 적은(까다로운) 사람부터, 대화할 수 있는 사람이 많은 그룹으로
  const order = [...pool].sort((a, b) => partnersIn(a, pool) - partnersIn(b, pool));
  let chunks: User[][] = [];
  let rest: User[] = [];
  for (const u of order) {
    const home = bestHome(chunks, u, target, 1);
    if (home) home.push(u);
    else if (chunks.length < n) chunks.push([u]);
    else rest.push(u);
  }
  // 대화 상대가 모자란 사람을 빼고, 인원이 모자란 그룹은 풀어요.
  const kept: User[][] = [];
  for (const c of chunks) {
    const p = prune(c, GROUP_MIN);
    if (p) {
      kept.push(p);
      rest.push(...c.filter((u) => !p.includes(u)));
    } else rest.push(...c);
  }
  chunks = kept;
  // 남은 사람은 최소 인원만큼 대화할 수 있는 그룹에 넣어 보고, 그래도 남으면 그 사람들끼리 새 그룹을 찾아요.
  for (let guard = 0; guard < 20 && rest.length; guard++) {
    const still: User[] = [];
    for (const u of rest) {
      const home = bestHome(chunks, u, GROUP_MAX, MIN_PARTNERS());
      if (home) home.push(u);
      else still.push(u);
    }
    rest = still;
    const g = bestGroup(rest, GROUP_MIN, GROUP_MAX);
    if (!g) break;
    chunks.push(g);
    rest = rest.filter((u) => !g.includes(u));
  }
  return { chunks, leftovers: [...hopeless, ...rest] };
}

/** 자리가 있고 이 사람이 minPartners명 이상과 대화할 수 있는 그룹 중, 대화 쌍과 원하는 성향 궁합이 가장 좋은 그룹 */
function bestHome(chunks: User[][], u: User, cap: number, minPartners: number) {
  let best: User[] | null = null;
  let bestScore = -1;
  for (const c of chunks) {
    if (c.length >= cap) continue;
    const partners = c.filter((m) => canMeet(m, u));
    if (partners.length < minPartners) continue;
    const score = partners.length * 10 + partners.reduce((sum, m) => sum + pairScore(m, u), 0);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

/** a가 원하는 상대 성향에 b가 얼마나 가까운지 (0~1). 원하는 게 없으면 0.5 */
export function wantFit(wants: PartnerWants | undefined, traits: TraitScores | undefined) {
  if (!wants || !traits) return 0.5;
  const keys = (Object.keys(wants) as TraitKey[]).filter((k) => wants[k] !== "any");
  if (!keys.length) return 0.5;
  const sum = keys.reduce((s, k) => s + (wants[k] === "high" ? traits[k] / 100 : 1 - traits[k] / 100), 0);
  return sum / keys.length;
}

/** 서로가 원하는 성향에 얼마나 맞는지 (양방향 평균) */
export function pairScore(a: User, b: User) {
  return (wantFit(a.partnerWants, b.analysis?.traits) + wantFit(b.partnerWants, a.analysis?.traits)) / 2;
}

export function defaultIcebreakers(theme: Pick<Theme, "tags">): string[] {
  const tag = theme.tags[0];
  return [
    tag ? `'${tag}'와 관련해 가장 기억에 남는 순간은?` : "요즘 가장 빠져 있는 건 뭐예요?",
    "주말을 완벽하게 보내는 방법을 알려 주세요.",
    "최근에 누군가에게 고마웠던 일이 있나요?",
  ];
}
