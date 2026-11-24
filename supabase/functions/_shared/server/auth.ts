// 로그인 확인: 브라우저는 Supabase 로그인(익명 로그인 포함)으로 받은 JWT를 Authorization 헤더로 보내요.
// 서명을 Supabase 공개키(JWKS)로 확인하고, 그 안의 sub(로그인 ID)로 히로 사용자를 찾아요.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../env.ts";
import { HttpError, fail } from "./http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/** 요청을 보낸 사람의 로그인 ID (Supabase auth.users.id) */
export async function authId(req: Request): Promise<string> {
  // 로컬 테스트 전용: HIRO_TEST_AUTH=1일 때만 헤더로 사용자를 지정할 수 있어요. 배포 환경에는 절대 켜지 마세요.
  if (env("HIRO_TEST_AUTH") === "1") {
    const id = req.headers.get("x-test-auth-id") ?? "";
    if (!UUID.test(id)) fail(401, "로그인이 필요해요.");
    return id;
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) fail(401, "로그인이 필요해요.");
  const base = env("SUPABASE_URL");
  if (!base) throw new Error("SUPABASE_URL is not set");
  try {
    if (!jwks) jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, jwks, { issuer: `${base}/auth/v1`, audience: "authenticated" });
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) fail(401, "로그인이 필요해요.");
    return payload.sub as string;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return fail(401, "로그인이 만료됐어요. 다시 접속해 주세요.");
  }
}

/** 운영자 확인: HIRO_ADMIN_KEY와 같은 x-admin-key 헤더가 있어야 해요. 키가 없으면 운영 기능은 닫혀 있어요. */
export function requireAdmin(req: Request) {
  const key = env("HIRO_ADMIN_KEY");
  if (!key || req.headers.get("x-admin-key") !== key) fail(403, "운영자만 쓸 수 있어요.");
}
