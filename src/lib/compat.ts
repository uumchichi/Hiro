// 만남 성향(머리 길이, 깁텍, 문담피)과 원하는 상대 조건, 양방향 궁합 판정
import type { User } from "./types";

export const HAIR = ["숏컷", "숏단", "단머", "중단", "긴머"] as const;
export type Hair = (typeof HAIR)[number];

export interface MatchTraits {
  hair: Hair;
  tg: number | null; // 0 = 온텍, 10 = 온깁, null = 플라토닉
  showTg: boolean; // 다른 사람에게 깁텍을 공개할지 (기본 비공개). 매칭에는 공개 여부와 상관없이 쓰입니다.
  tattoo: boolean;
  smoke: boolean;
  piercing: boolean;
}

export interface MatchPrefs {
  hair: Hair[]; // 비어 있으면 상관없음
  tgMin: number;
  tgMax: number;
  platonic: "no" | "ok" | "only"; // 플라토닉 상대: 원하지 않음 / 괜찮음 / 플라토닉만
  noTattoo: boolean;
  noSmoke: boolean;
  noPiercing: boolean;
}

export const DEFAULT_PREFS: MatchPrefs = { hair: [], tgMin: 0, tgMax: 10, platonic: "ok", noTattoo: false, noSmoke: false, noPiercing: false };

export function tgLabel(v: number | null) {
  if (v === null) return "플라토닉";
  if (v <= 0) return "온텍";
  if (v >= 10) return "온깁";
  if (v <= 3) return `텍 쪽 (${v})`;
  if (v >= 7) return `깁 쪽 (${v})`;
  return `중간 (${v})`;
}

export function mdpLabel(t: Pick<MatchTraits, "tattoo" | "smoke" | "piercing">) {
  const has = [t.tattoo && "문신", t.smoke && "담배", t.piercing && "피어싱"].filter(Boolean);
  return has.length ? `${has.join("·")} O` : "문담피 X";
}

/** b가 a의 조건에 맞는지 (한 방향) */
export function accepts(a: User, b: User): boolean {
  const p = a.prefs;
  const t = b.matchTraits;
  if (!p || !t) return true; // 정보가 없으면 제한하지 않음
  if (p.hair.length && !p.hair.includes(t.hair)) return false;
  if (t.tg === null) {
    if (p.platonic === "no") return false;
  } else if (p.platonic === "only" || t.tg < p.tgMin || t.tg > p.tgMax) return false;
  if (p.noTattoo && t.tattoo) return false;
  if (p.noSmoke && t.smoke) return false;
  if (p.noPiercing && t.piercing) return false;
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
