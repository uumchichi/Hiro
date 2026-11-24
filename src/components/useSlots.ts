"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SlotView {
  id: string;
  theme: { title: string; emoji: string; description: string; tags: string[] };
  startsAt: number;
  status: "open" | "forming" | "started" | "cancelled";
  applicants: number;
  present: number;
  applied: boolean;
  curated: boolean; // 운영진 기획 이벤트
  capacity: number | null;
  roundSeconds: number;
  canCheckIn: boolean;
  missed: boolean;
  note: string | null;
}

export interface SlotsResponse {
  now: number;
  slots: SlotView[];
  config: { min: number; max: number; checkinMinutes: number; breakSeconds: number };
}

export function useSlots(pollMs = 5000) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch("/api/slots", { cache: "no-store" });
      if (res.ok) {
        const d: SlotsResponse = await res.json();
        setOffset(d.now - Date.now());
        setData(d);
      }
    } catch {
      /* 다음 폴링에서 재시도 */
    }
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);
  return { data, refresh, serverNow: () => Date.now() + offset };
}

export function fmtWhen(ts: number, now: number) {
  const d = new Date(ts);
  const today = new Date(now);
  const tomorrow = new Date(now + 86400000);
  const day =
    d.toDateString() === today.toDateString() ? "오늘" : d.toDateString() === tomorrow.toDateString() ? "내일" : `${d.getMonth() + 1}/${d.getDate()}`;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${m}`;
}

export function fmtUntil(ms: number) {
  if (ms <= 0) return "곧 시작";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min}분 뒤`;
  const h = Math.floor(min / 60);
  return `${h}시간 ${min % 60 ? `${min % 60}분 ` : ""}뒤`;
}
