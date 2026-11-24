"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ViewState } from "@/lib/server";
import { apiFetch } from "@/lib/api";

export type { ViewState };

/** 서버의 내 상태를 가져오고, pollMs가 있으면 주기적으로 갱신합니다. */
/** presence: 대화방 화면에서 true로 두면 1:1 대화가 이어지는지 서버에 알려요 (입장권 차감 기준). */
export function useHiro(pollMs?: number, opts?: { presence?: boolean }) {
  const presence = Boolean(opts?.presence);
  const [state, setState] = useState<ViewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0); // 서버 시각 - 내 시각

  const apply = useCallback((s: ViewState) => {
    offset.current = s.now - Date.now();
    setState(s);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(presence ? "/api/state?presence=1" : "/api/state", { cache: "no-store" });
      if (res.ok) apply(await res.json());
    } catch {
      /* 다음 폴링에서 재시도 */
    }
  }, [apply, presence]);

  useEffect(() => {
    refresh();
    if (!pollMs) return;
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  const post = useCallback(
    async (url: string, body?: unknown) => {
      setError(null);
      const res = await apiFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "문제가 생겼어요. 다시 시도해 주세요.");
        return null;
      }
      if (data.user) apply(data as ViewState);
      return data;
    },
    [apply],
  );

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { state, error, setError, refresh, post, serverNow };
}

/** 1초마다 다시 그리기 위한 틱 */
export function useTick(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 상태에 맞는 다음 페이지 */
export function nextPath(s: ViewState | null) {
  if (!s) return "/start";
  switch (s.user.status) {
    case "new":
      return "/start";
    case "profiled":
      return "/quiz";
    case "analyzed":
      return "/lobby";
    case "grouped":
      return "/room";
  }
}
