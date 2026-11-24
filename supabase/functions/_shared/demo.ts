// 혼자서도 매칭·로테이션 흐름을 시험할 수 있도록 데모 참가자를 만듭니다.
import { DEFAULT_PREFS, HAIR, suggestRange } from "./compat.ts";
import { BANDS, cellKey } from "./schedule.ts";
import { computeTraits, ruleAnalysis } from "./heuristics.ts";
import { QUESTIONS, REGIONS, TAG_GROUPS } from "./questions.ts";
import { newId } from "./world.ts";
import type { User } from "./types.ts";

const NAMES = ["하늘", "보리", "은재", "다온", "서아", "지안", "라온", "도담", "새봄", "윤슬", "가람", "해솔", "초아", "아라", "나린", "소담", "예린", "미르"];
const BIOS = [
  "퇴근 후 고양이랑 뒹구는 게 낙이에요.",
  "주말마다 새로운 카페를 찾아다녀요.",
  "교회 청년부에서 찬양팀 하고 있어요.",
  "매운 건 못 먹지만 디저트는 자신 있어요!",
  "러닝 크루에서 한강 달리는 걸 좋아해요.",
  "책 읽고 이야기 나누는 걸 좋아합니다.",
  "캠핑 장비 모으는 게 취미예요.",
  "전시 보러 다니는 걸 좋아해요. 추천 환영!",
];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function makeDemoUser(i: number): User {
  // 테마가 잘 생기도록 몇몇 태그에 가중치를 줍니다.
  const tags = new Set<string>();
  tags.add(pick(["기독교", "기독교", "무교", "천주교", "불교"]));
  if (Math.random() < 0.5) tags.add(pick(["고양이 집사", "고양이 집사", "강아지 집사"]));
  if (Math.random() < 0.45) tags.add("맵찔이");
  for (let k = 0; k < 2; k++) tags.add(pick(TAG_GROUPS[4].tags));
  tags.add(pick(TAG_GROUPS[5].tags));
  const answers = QUESTIONS.map(() => 1 + Math.floor(Math.random() * 5));
  // 히로 컬러: 양 끝(딥 핑크·딥 블루)과 중간이 고르게, 가끔 옐로(플라토닉)
  const tg: number | null = Math.random() < 0.1 ? null : pick([0, 1, 2, 3, 5, 7, 8, 9, 10]);
  const traits = computeTraits(answers);
  const profile = {
    nickname: `${pick(NAMES)}${i}`,
    birthYear: 1990 + Math.floor(Math.random() * 12),
    region: pick(REGIONS.slice(0, 6)),
    bio: pick(BIOS),
    tags: [...tags],
  };
  return {
    id: newId("demo"),
    createdAt: Date.now(),
    isDemo: true,
    status: "analyzed",
    profile,
    answers,
    analysis: ruleAnalysis(traits, profile.tags),
    // 저녁·밤과 주말에 몰리도록 선호 시간대를 고릅니다.
    availability: [0, 1, 2, 3, 4, 5, 6].flatMap((d) =>
      BANDS.filter((b) => Math.random() < (b.id === "evening" || b.id === "night" ? 0.55 : d === 0 || d === 6 ? 0.4 : 0.1)).map((b) =>
        cellKey(d, b.id),
      ),
    ),
    partnerWants: {
      energy: pick(["low", "any", "high"] as const),
      empathy: pick(["any", "high"] as const),
      planning: pick(["low", "any", "any", "high"] as const),
      openness: pick(["low", "any", "high"] as const),
      expression: pick(["low", "any", "high"] as const),
    },
    matchTraits: {
      hair: pick([...HAIR]),
      tg,
      showTg: Math.random() < 0.4,
      smoke: pick(["none", "none", "none", "none", "ecig", "cig"] as const),
      tattoo: pick(["none", "none", "none", "small", "small", "medium", "large"] as const),
      piercing: pick(["none", "none", "ears", "ears", "face"] as const),
    },
    // 데모도 실제 사용자처럼 대부분 자기 컬러의 반대쪽을 원하고, 일부는 상관없어요.
    prefs: {
      ...DEFAULT_PREFS,
      ...(Math.random() < 0.75 ? suggestRange(tg) : {}),
      platonic: tg === null ? "only" : Math.random() < 0.8 ? "ok" : "no",
      ...(Math.random() < 0.25 ? { smokeMax: pick(["none", "ecig"] as const) } : {}),
      ...(Math.random() < 0.15 ? { tattooMax: pick(["small", "medium"] as const) } : {}),
    },
  };
}
