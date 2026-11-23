// 만남 성향(머리 길이, 히로 컬러(내부 이름: 깁텍), 문담피)과 원하는 상대 조건, 양방향 궁합 판정
import type { User } from "./types";

export const HAIR = ["숏컷", "숏단", "단머", "중단", "긴머"] as const;
export type Hair = (typeof HAIR)[number];

// ── 문담피: 단계가 높을수록 '더 많이/크게' ──
export const SMOKE = [
  { v: "none", me: "안 피워요", allow: "비흡연자만", short: "비흡연" },
  { v: "ecig", me: "전자담배만", allow: "전자담배까지 괜찮아요", short: "전자담배" },
  { v: "cig", me: "연초 피워요", allow: "상관없어요", short: "연초" },
] as const;
export const TATTOO = [
  { v: "none", me: "없어요", allow: "문신 없는 사람이 좋아요", short: "" },
  { v: "small", me: "작은 문신 (레터링·포인트)", allow: "작은 문신까지 괜찮아요", short: "작은 문신" },
  { v: "medium", me: "중간 크기 (팔·다리 등)", allow: "중간 크기까지 괜찮아요", short: "문신" },
  { v: "large", me: "큰 문신 (이레즈미·전신 등)", allow: "상관없어요", short: "큰 문신" },
] as const;
export const PIERCING = [
  { v: "none", me: "없어요", allow: "피어싱 없는 사람이 좋아요", short: "" },
  { v: "ears", me: "귀만", allow: "귀 피어싱까지 괜찮아요", short: "귀 피어싱" },
  { v: "face", me: "얼굴·바디 피어싱도 있어요", allow: "상관없어요", short: "피어싱" },
] as const;

export type Smoke = (typeof SMOKE)[number]["v"];
export type Tattoo = (typeof TATTOO)[number]["v"];
export type Piercing = (typeof PIERCING)[number]["v"];

const rank = <T extends string>(list: readonly { v: T }[], v: T) => list.findIndex((x) => x.v === v);

export interface MatchTraits {
  hair: Hair;
  tg: number | null; // 0 = 온텍, 10 = 온깁, null = 플라토닉
  showTg: boolean; // 다른 사람에게 히로 컬러를 공개할지 (기본 비공개). 매칭에는 공개 여부와 상관없이 쓰입니다.
  smoke: Smoke;
  tattoo: Tattoo;
  piercing: Piercing;
}

export interface MatchPrefs {
  hair: Hair[]; // 비어 있으면 상관없음
  tgMin: number;
  tgMax: number;
  platonic: "no" | "ok" | "only"; // 플라토닉 상대: 원하지 않음 / 괜찮음 / 플라토닉만
  smokeMax: Smoke; // 상대가 여기까지면 괜찮음
  tattooMax: Tattoo;
  piercingMax: Piercing;
}

export const DEFAULT_PREFS: MatchPrefs = {
  hair: [],
  tgMin: 0,
  tgMax: 10,
  platonic: "ok",
  smokeMax: "cig",
  tattooMax: "large",
  piercingMax: "face",
};

export const DEFAULT_HABITS: Pick<MatchTraits, "smoke" | "tattoo" | "piercing"> = { smoke: "none", tattoo: "none", piercing: "none" };

/** 화면에 보이는 이름: 히로 컬러 */
export function tgLabel(v: number | null) {
  if (v === null) return "옐로";
  if (v <= 0) return "딥 핑크";
  if (v <= 3) return "핑크";
  if (v <= 6) return "퍼플";
  if (v <= 9) return "블루";
  return "딥 블루";
}

/** AI에게만 넘기는 설명 (화면에는 쓰지 않음) */
export function tgInternal(v: number | null) {
  if (v === null) return "플라토닉";
  return `${v}/10 (0=온텍, 10=온깁)`;
}

export function mdpLabel(t: Pick<MatchTraits, "tattoo" | "smoke" | "piercing">) {
  const parts = [
    t.smoke !== "none" && SMOKE[rank(SMOKE, t.smoke)]?.short,
    TATTOO[rank(TATTOO, t.tattoo)]?.short,
    PIERCING[rank(PIERCING, t.piercing)]?.short,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "문담피 X";
}

/** 예전 형식(true/false) 데이터를 새 단계로 바꿉니다. */
export function normalizeTraits(t: MatchTraits): MatchTraits {
  const legacy = t as unknown as Record<string, unknown>;
  return {
    ...t,
    smoke: typeof legacy.smoke === "boolean" ? (legacy.smoke ? "cig" : "none") : t.smoke ?? "none",
    tattoo: typeof legacy.tattoo === "boolean" ? (legacy.tattoo ? "medium" : "none") : t.tattoo ?? "none",
    piercing: typeof legacy.piercing === "boolean" ? (legacy.piercing ? "ears" : "none") : t.piercing ?? "none",
  };
}

export function normalizePrefs(p: MatchPrefs): MatchPrefs {
  const legacy = p as unknown as Record<string, unknown>;
  return {
    ...DEFAULT_PREFS,
    ...p,
    smokeMax: p.smokeMax ?? (legacy.noSmoke ? "none" : "cig"),
    tattooMax: p.tattooMax ?? (legacy.noTattoo ? "none" : "large"),
    piercingMax: p.piercingMax ?? (legacy.noPiercing ? "none" : "face"),
  };
}

/** b가 a의 조건에 맞는지 (한 방향) */
export function accepts(a: User, b: User): boolean {
  if (!a.prefs || !b.matchTraits) return true; // 정보가 없으면 제한하지 않음
  const p = normalizePrefs(a.prefs);
  const t = normalizeTraits(b.matchTraits);
  if (p.hair.length && !p.hair.includes(t.hair)) return false;
  if (t.tg === null) {
    if (p.platonic === "no") return false;
  } else if (p.platonic === "only" || t.tg < p.tgMin || t.tg > p.tgMax) return false;
  if (rank(SMOKE, t.smoke) > rank(SMOKE, p.smokeMax)) return false;
  if (rank(TATTOO, t.tattoo) > rank(TATTOO, p.tattooMax)) return false;
  if (rank(PIERCING, t.piercing) > rank(PIERCING, p.piercingMax)) return false;
  return true;
}

/** 서로의 조건에 모두 맞는지 (양방향) */
export function compatible(a: User, b: User) {
  return accepts(a, b) && accepts(b, a);
}

/** 그룹 안의 모든 쌍이 서로 맞는지 */
export function groupOk(members: User[]) {
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) if (!compatible(members[i], members[j])) return false;
  return true;
}

/**
 * 모든 쌍이 서로 맞도록 사람들을 묶습니다 (탐욕적 방식).
 * 남는 사람은 leftovers로 돌려줍니다.
 */
export function packCompatible(list: User[], min: number, max: number): { chunks: User[][]; leftovers: User[] } {
  const chunks: User[][] = [];
  for (const u of list) {
    const home = chunks.find((c) => c.length < max && c.every((m) => compatible(m, u)));
    if (home) home.push(u);
    else chunks.push([u]);
  }
  const ok = chunks.filter((c) => c.length >= min);
  const leftovers = chunks.filter((c) => c.length < min).flat();
  return { chunks: ok, leftovers };
}

// ── 히로 스펙트럼 색: 플라토닉 노랑 · 온텍 분홍 → 중간 보라 → 온깁 파랑 ──
export const SPECTRUM = { platonic: "#f7c325", tek: "#ff4f9a", mid: "#9b5cff", gib: "#3b7bff" };

function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export function tgColor(v: number | null) {
  if (v === null) return SPECTRUM.platonic;
  return v <= 5 ? mix(SPECTRUM.tek, SPECTRUM.mid, v / 5) : mix(SPECTRUM.mid, SPECTRUM.gib, (v - 5) / 5);
}
