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

/** fetch와 같지만 "/api/..." 주소를 알맞은 서버로 보내요. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!usesSupabase || !url.startsWith("/api/")) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${await accessToken()}`);
  if (SUPABASE_ANON_KEY) headers.set("apikey", SUPABASE_ANON_KEY);
  const res = await fetch(API_BASE + url.slice("/api".length), { ...init, headers });
  if (res.status === 401) {
    // 토큰이 만료됐으면 한 번 새로 받아서 다시 시도해요.
    await supabase().auth.refreshSession();
    headers.set("authorization", `Bearer ${await accessToken()}`);
    return fetch(API_BASE + url.slice("/api".length), { ...init, headers });
  }
  return res;
}
