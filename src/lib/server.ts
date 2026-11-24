// 서버 공용 도우미: 사용자 쿠키, 운영자 확인, LiveKit 토큰, 화면용 상태 계산
import { cookies, headers } from "next/headers";
import { mutate, newId, readDb } from "./store";
import type { User } from "./types";

const COOKIE = "hiro_uid";

export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  return readDb().users[id] ? id : null;
}

const ID_FORMAT = /^u_[0-9a-f]{12}$/;

/**
 * 쿠키의 사용자를 가져오고, 없으면 그 쿠키 ID로 만듭니다.
 * 쿠키는 미들웨어가 첫 요청 때 한 번만 정하므로, 동시에 온 요청들도 같은 사용자를 가리켜요.
 */
export async function ensureUser(): Promise<User> {
  const jar = await cookies();
  const cookieId = jar.get(COOKIE)?.value;
  if (cookieId && readDb().users[cookieId]) return readDb().users[cookieId];
  const validId = cookieId && ID_FORMAT.test(cookieId) ? cookieId : null;
  const user = mutate((db) => {
    const id = validId ?? newId("u");
    // 동시에 온 다른 요청이 이미 만들었으면 그 사용자를 써요.
    if (db.users[id]) return db.users[id];
    const u: User = { id, createdAt: Date.now(), isDemo: false, status: "new" };
    db.users[u.id] = u;
    return u;
  });
  if (user.id !== cookieId) {
    jar.set(COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
  return user;
}

export async function isAdmin(): Promise<boolean> {
  const key = process.env.HIRO_ADMIN_KEY;
  if (!key) return true; // 개발 중에는 키 없이 열림. 배포 시 꼭 설정하세요.
  const h = await headers();
  return h.get("x-admin-key") === key;
}

export { livekitConfigured } from "./state";

export { livekitToken, livekitUrl } from "../../supabase/functions/_shared/voice.ts";

export { publicMember, syncAllGroups, syncGroupStatus, viewState } from "./state";
export type { PublicMember, ViewState } from "./state";
