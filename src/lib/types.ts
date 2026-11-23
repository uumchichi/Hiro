// 히로(Hiro) 도메인 타입

export type TraitKey = "energy" | "empathy" | "planning" | "openness" | "expression";

export type TraitScores = Record<TraitKey, number>; // 0~100

export interface Profile {
  nickname: string;
  birthYear: number;
  region: string;
  bio: string;
  tags: string[]; // 라이프스타일 태그 (예: "기독교", "고양이 집사", "맵찔이")
}

export interface Analysis {
  typeName: string; // 예: "다정한 탐험가"
  emoji: string;
  summary: string;
  strengths: string[];
  conversationTips: string[];
  idealMatch: string;
  traits: TraitScores;
  source: "ai" | "rule";
}

export type UserStatus = "new" | "profiled" | "analyzed" | "waiting" | "grouped";

export interface User {
  id: string;
  createdAt: number;
  isDemo: boolean;
  status: UserStatus;
  profile?: Profile;
  answers?: number[]; // 성향 검사 응답 (1~5)
  analysis?: Analysis;
  groupId?: string;
}

export interface Theme {
  id: string;
  title: string; // 예: "고양이 집사들의 수다"
  emoji: string;
  description: string;
  tags: string[]; // 이 테마와 관련된 라이프스타일 태그
}

export type GroupStatus = "ready" | "live" | "choosing" | "done";

export interface Pair {
  a: string;
  b: string;
}

export interface Round {
  pairs: Pair[];
  resting: string[]; // 홀수 인원일 때 쉬는 사람
}

export interface Group {
  id: string;
  createdAt: number;
  theme: Theme;
  memberIds: string[];
  reason: string;
  icebreakers: string[];
  status: GroupStatus;
  rounds: Round[];
  roundSeconds: number;
  breakSeconds: number;
  startedAt?: number;
  choices: Record<string, string[]>; // userId -> 호감 표시한 userId 목록
  submitted: string[]; // 선택을 제출한 userId
}

export interface MatchRun {
  id: string;
  createdAt: number;
  source: "ai" | "rule";
  themes: Theme[];
  groupIds: string[];
  unmatched: string[];
  note: string;
}

export interface DB {
  users: Record<string, User>;
  groups: Record<string, Group>;
  matchRuns: MatchRun[];
}
