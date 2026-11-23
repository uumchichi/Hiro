// 혼자서도 매칭·로테이션 흐름을 시험할 수 있도록 데모 참가자를 만듭니다.
import { DEFAULT_PREFS, HAIR } from "./compat";
import { computeTraits, ruleAnalysis } from "./heuristics";
import { QUESTIONS, REGIONS, TAG_GROUPS } from "./questions";
import { newId } from "./store";
import type { User } from "./types";

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
    status: "waiting",
    profile,
    answers,
    analysis: ruleAnalysis(traits, profile.tags),
    matchTraits: {
      hair: pick([...HAIR]),
      tg: Math.random() < 0.12 ? null : Math.floor(Math.random() * 11),
      showTg: true,
      tattoo: Math.random() < 0.2,
      smoke: Math.random() < 0.15,
      piercing: Math.random() < 0.3,
    },
    // 데모는 대부분 너그러운 조건, 일부만 까다로운 조건
    prefs:
      Math.random() < 0.7
        ? { ...DEFAULT_PREFS }
        : { ...DEFAULT_PREFS, noSmoke: true, tgMin: Math.random() < 0.5 ? 0 : 4, tgMax: Math.random() < 0.5 ? 6 : 10 },
  };
}
