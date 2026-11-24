import type { TraitKey } from "./types.ts";

export interface Question {
  id: number;
  text: string;
  trait: TraitKey;
  reverse?: boolean; // 그렇다(5)일수록 점수가 낮아지는 문항
}

export const TRAIT_LABELS: Record<TraitKey, { name: string; low: string; high: string }> = {
  energy: { name: "에너지", low: "차분한", high: "활발한" },
  empathy: { name: "공감", low: "이성적인", high: "공감하는" },
  planning: { name: "계획", low: "즉흥적인", high: "계획적인" },
  openness: { name: "새로움", low: "익숙함을 즐기는", high: "새로움을 찾는" },
  expression: { name: "표현", low: "은은한", high: "솔직한" },
};

export const QUESTIONS: Question[] = [
  { id: 1, trait: "energy", text: "처음 만난 사람과도 금방 말을 트는 편이다." },
  { id: 2, trait: "energy", text: "주말에는 집에서 혼자 충전하는 시간이 꼭 필요하다.", reverse: true },
  { id: 3, trait: "energy", text: "여럿이 모인 자리에서 대화를 이끄는 경우가 많다." },
  { id: 4, trait: "empathy", text: "친구의 고민을 들으면 해결책보다 마음을 먼저 들어준다." },
  { id: 5, trait: "empathy", text: "영화나 드라마를 보다가 자주 울컥한다." },
  { id: 6, trait: "planning", text: "약속이 있으면 동선과 맛집을 미리 찾아둔다." },
  { id: 7, trait: "planning", text: "여행은 계획 없이 떠나도 즐겁다.", reverse: true },
  { id: 8, trait: "openness", text: "안 가본 동네, 안 먹어본 음식에 끌린다." },
  { id: 9, trait: "openness", text: "단골 가게에서 늘 먹던 메뉴를 시키는 게 편하다.", reverse: true },
  { id: 10, trait: "expression", text: "서운한 일이 생기면 바로 말하는 편이다." },
  { id: 11, trait: "expression", text: "좋아하는 마음을 먼저 표현하는 게 어렵지 않다." },
  { id: 12, trait: "expression", text: "감정은 혼자 정리한 뒤에 이야기하는 편이다.", reverse: true },
];

/** 원하는 상대 성향 질문. [낮은 쪽, 높은 쪽] 선택지 문구 */
export const PARTNER_QUESTIONS: { trait: TraitKey; text: string; low: string; high: string }[] = [
  { trait: "energy", text: "대화할 때 어떤 상대가 편해요?", low: "차분하게 들어주는 사람", high: "대화를 이끌어 주는 사람" },
  { trait: "empathy", text: "고민을 말했을 때 어떤 반응이 좋아요?", low: "담백하게 정리해 주는 사람", high: "마음을 먼저 알아주는 사람" },
  { trait: "planning", text: "데이트는 어떤 스타일이 좋아요?", low: "그때그때 즉흥적인 사람", high: "미리 계획을 챙기는 사람" },
  { trait: "openness", text: "함께할 때 어떤 사람이 좋아요?", low: "익숙한 걸 같이 즐기는 사람", high: "새로운 걸 같이 찾는 사람" },
  { trait: "expression", text: "마음 표현은 어떤 사람이 좋아요?", low: "은은하게 표현하는 사람", high: "솔직하게 표현하는 사람" },
];

export const LIKERT = ["전혀 아니다", "아니다", "보통", "그렇다", "매우 그렇다"];

/** 라이프스타일 태그. 테마 선정 AI가 이 태그들을 보고 그룹 테마를 만듭니다. */
export const TAG_GROUPS: { label: string; tags: string[] }[] = [
  { label: "종교", tags: ["기독교", "천주교", "불교", "무교"] },
  { label: "반려동물", tags: ["고양이 집사", "강아지 집사", "반려동물 로망", "동물 알러지"] },
  { label: "음식", tags: ["맵찔이", "매운맛 러버", "비건/채식", "디저트 러버", "미식 탐방"] },
  { label: "술·담배", tags: ["술 안 마셔요", "술 좋아해요", "비흡연"] },
  { label: "취미", tags: ["운동", "러닝", "요가/필라테스", "독서", "게임", "여행", "전시/공연", "요리", "캠핑", "덕질", "영화"] },
  { label: "생활", tags: ["아침형", "올빼미형", "집순이", "밖순이", "직장인", "학생", "프리랜서"] },
];

export const ALL_TAGS = TAG_GROUPS.flatMap((g) => g.tags);

export const REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주", "울산", "세종", "강원", "충청", "전라", "경상", "제주", "해외"];
