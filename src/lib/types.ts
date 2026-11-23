// 히로(Hiro) 도메인 타입
import type { MatchPrefs, MatchTraits } from "./compat";

export type TraitKey = "energy" | "empathy" | "planning" | "openness" | "expression";

export type TraitScores = Record<TraitKey, number>; // 0~100

/** 원하는 상대 성향: 축마다 낮은 쪽 / 상관없음 / 높은 쪽 */
export type Want = "low" | "any" | "high";
export type PartnerWants = Record<TraitKey, Want>;

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

export type UserStatus = "new" | "profiled" | "analyzed" | "grouped";

export interface User {
  id: string;
  createdAt: number;
  isDemo: boolean;
  status: UserStatus;
  profile?: Profile;
  matchTraits?: MatchTraits; // 내 만남 성향
  prefs?: MatchPrefs; // 원하는 상대
  answers?: number[]; // 성향 검사 응답 (1~5)
  partnerWants?: PartnerWants; // 원하는 상대 성향
  availability?: string[]; // 선호 시간대 ("5-evening" = 금요일 저녁). 요일은 0=일 ~ 6=토
  analysis?: Analysis;
  groupId?: string;
}

export interface Theme {
  id: string;
  title: string; // 예: "고양이 집사들의 수다"
  emoji: string;
  description: string;
  tags: string[]; // 이 테마와 관련된 라이프스타일 태그
  icebreakers?: string[]; // 이 테마의 1:1 대화 주제
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

/** 테마 세션: 정해진 시간에 열리고, 신청 후 대기실에 들어온 사람끼리 그룹이 됩니다. */
export type SlotStatus = "open" | "forming" | "started" | "cancelled";

export interface Slot {
  id: string;
  createdAt: number;
  theme: Theme;
  startsAt: number;
  status: SlotStatus;
  applicants: string[];
  checkins: Record<string, number>; // userId -> 대기실에 마지막으로 있었던 시각
  groupIds: string[];
  missed: string[]; // 신청했지만 그룹에 들어가지 못한 사람
  roundSeconds?: number; // 테스트용으로 라운드 길이를 바꿀 때
  inviteOnly?: boolean; // AI 예약 초대로 확정된 비공개 세션
  note?: string;
}

export interface ThemeCatalog {
  createdAt: number;
  source: "ai" | "rule";
  note: string;
  themes: Theme[];
}

/** 대기실에 들어와 있는 사람 */
export interface LobbyEntry {
  joinedAt: number;
  lastSeen: number; // 대기실 화면이 마지막으로 신호를 보낸 시각
  interests: string[]; // 관심 테마 id (비어 있으면 아무 테마나)
  priority: number; // 마감·무산된 횟수만큼 다음 초대에서 우선
  note?: string; // 마지막 초대 결과 안내
}

export type InviteStatus = "open" | "started" | "confirmed" | "expired";

/** AI 초대장: 서로 조건이 모두 맞는 사람들에게 보내고, 선착순으로 수락한 사람끼리 시작합니다. */
export interface Invite {
  id: string;
  kind: "now" | "scheduled"; // 바로 시작 / 특정 시간 예약
  startsAt?: number; // 예약 초대의 세션 시작 시각
  slotId?: string; // 예약이 확정되면 만들어지는 세션
  createdAt: number;
  expiresAt: number;
  theme: Theme;
  invitees: string[];
  accepted: string[]; // 수락한 순서대로
  declined: string[];
  status: InviteStatus;
  groupId?: string;
  source: "ai" | "rule";
  demoPlan?: Record<string, { at: number; accept: boolean }>; // 데모 참가자 자동 응답
}

export interface DB {
  users: Record<string, User>;
  groups: Record<string, Group>;
  slots: Record<string, Slot>;
  catalog: ThemeCatalog | null;
  catalogCursor: number;
  lobby: Record<string, LobbyEntry>;
  invites: Record<string, Invite>;
}
