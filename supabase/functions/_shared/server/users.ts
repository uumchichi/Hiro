// 사용자 행 ↔ 공용 로직의 User 모양
import { mdpLabel, normalizeTraits, tgColor, tgLabel } from "../compat.ts";
import type { User } from "../types.ts";
import type { Sql, Tx } from "./db.ts";

type Q = Sql | Tx;

export interface UserRow {
  id: string;
  auth_id: string | null;
  code: string;
  created_at: Date;
  is_demo: boolean;
  status: User["status"];
  profile: User["profile"] | null;
  match_traits: User["matchTraits"] | null;
  prefs: User["prefs"] | null;
  answers: number[] | null;
  partner_wants: User["partnerWants"] | null;
  availability: string[];
  analysis: User["analysis"] | null;
  group_id: string | null;
}

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    createdAt: new Date(r.created_at).getTime(),
    isDemo: r.is_demo,
    status: r.status,
    code: r.code,
    profile: r.profile ?? undefined,
    matchTraits: r.match_traits ?? undefined,
    prefs: r.prefs ?? undefined,
    answers: r.answers ?? undefined,
    partnerWants: r.partner_wants ?? undefined,
    availability: r.availability ?? [],
    analysis: r.analysis ?? undefined,
    groupId: r.group_id ?? undefined,
  };
}

// 공개 ID: 헷갈리는 글자(0/O, 1/I)를 뺀 숫자+대문자 5글자
const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
function randomUserId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "u_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 로그인 ID로 히로 사용자를 찾고, 없으면 만들어요.
 * 첫 방문에 요청이 동시에 여러 개 와도 auth_id가 unique라서 사용자는 한 명만 생겨요.
 */
export async function ensureUser(q: Q, authId: string): Promise<User> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const found = await q<UserRow[]>`select * from users where auth_id = ${authId}`;
    if (found.length) return toUser(found[0]);
    // 공개 ID가 우연히 겹치면(unique 위반) 다른 코드로 다시 시도해요.
    const made = await q<UserRow[]>`
      insert into users (id, auth_id, code) values (${randomUserId()}, ${authId}, ${randomCode()})
      on conflict do nothing
      returning *`;
    if (made.length) return toUser(made[0]);
  }
  throw new Error("could not create user");
}

/** 트랜잭션 안에서 사용자 행을 잠그고 읽어요 (같은 사용자의 요청이 겹치지 않도록). */
export async function lockUser(t: Tx, id: string): Promise<User> {
  const rows = await t<UserRow[]>`select * from users where id = ${id} for update`;
  if (!rows.length) throw new Error(`user ${id} not found`);
  return toUser(rows[0]);
}

export async function getUsers(q: Q, ids: string[]): Promise<Map<string, User>> {
  if (!ids.length) return new Map();
  const rows = await q<UserRow[]>`select * from users where id = any(${ids})`;
  return new Map(rows.map((r) => [r.id, toUser(r)]));
}

/** 다른 참가자에게 보여도 되는 정보만. 히로 컬러는 본인이 공개한 경우에만 보여요. */
export function publicMember(u: User | undefined) {
  if (!u) return null;
  return {
    id: u.id,
    code: u.code ?? "",
    nickname: u.profile?.nickname ?? "참가자",
    age: u.profile ? new Date().getFullYear() - u.profile.birthYear + 1 : null,
    region: u.profile?.region ?? "",
    tags: u.profile?.tags ?? [],
    typeName: u.analysis?.typeName ?? "",
    emoji: u.analysis?.emoji ?? "🙂",
    bio: u.profile?.bio ?? "",
    hair: u.matchTraits?.hair ?? null,
    tg: u.matchTraits?.showTg ? tgLabel(u.matchTraits.tg) : null,
    tgColor: u.matchTraits?.showTg ? tgColor(u.matchTraits.tg) : null,
    mdp: u.matchTraits ? mdpLabel(normalizeTraits(u.matchTraits)) : null,
  };
}

export type PublicMember = NonNullable<ReturnType<typeof publicMember>>;
