"use client";
// 화면 → 서버 호출. 두 가지 방식을 같은 코드로 지원해요.
// · Next 앱 (npm run dev): 같은 서버의 /api/... 를 부르고, 사용자는 쿠키로 구분해요.
// · GitHub Pages (정적 사이트): Supabase 서버 함수를 부르고, 사용자는 Supabase 익명 로그인으로 구분해요.
//   NEXT_PUBLIC_API_BASE(서버 함수 주소)가 있으면 이 방식이에요.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const usesSupabase = Boolean(API_BASE);

let client: SupabaseClient | null = null;
let signingIn: Promise<string> | null = null;

function supabase() {
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "hiro-auth" },
  });
  return client;
}

/** 로그인 토큰. 처음 방문이면 익명 로그인을 해요 (동시에 여러 번 불려도 한 번만). */
async function accessToken(): Promise<string> {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;
  signingIn ??= sb.auth
    .signInAnonymously()
    .then(({ data, error }) => {
      if (error || !data.session) throw error ?? new Error("anonymous sign-in failed");
      return data.session.access_token;
    })
    .finally(() => {
      signingIn = null;
    });
  return signingIn;
}

/** 서버 연결 상태를 화면 위쪽 안내(ApiStatus)에 알려요. problem이 없으면 안내를 지워요. */
export type ApiProblem = { path: string; status: number; message: string } | null;
export const API_PROBLEM_EVENT = "hiro-api-problem";
function report(problem: ApiProblem) {
  try {
    window.dispatchEvent(new CustomEvent<ApiProblem>(API_PROBLEM_EVENT, { detail: problem }));
  } catch {
    /* 서버 렌더링 중에는 무시 */
  }
}

/** fetch와 같지만 "/api/..." 주소를 알맞은 서버로 보내요. 실패하면 화면에 안내가 떠요. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!usesSupabase || !url.startsWith("/api/")) return fetch(url, init);
  const target = API_BASE + url.slice("/api".length);
  let res: Response;
  try {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await accessToken()}`);
    if (SUPABASE_ANON_KEY) headers.set("apikey", SUPABASE_ANON_KEY);
    res = await fetch(target, { ...init, headers });
    if (res.status === 401) {
      // 토큰이 만료됐으면 한 번 새로 받아서 다시 시도해요.
      await supabase().auth.refreshSession();
      headers.set("authorization", `Bearer ${await accessToken()}`);
      res = await fetch(target, { ...init, headers });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 로그인(익명 로그인)이 거부된 경우와 네트워크 문제를 구분해 알려요.
    report({ path: url, status: 0, message: /anonymous|sign.?in|signup/i.test(msg) ? `로그인에 실패했어요 (${msg})` : `서버에 연결하지 못했어요 (${msg})` });
    throw err;
  }
  if (res.status >= 500 || res.status === 401) {
    report({ path: url, status: res.status, message: res.status === 401 ? "로그인 확인에 실패했어요" : "서버에서 문제가 생겼어요" });
  } else {
    report(null);
  }
  return res;
}
