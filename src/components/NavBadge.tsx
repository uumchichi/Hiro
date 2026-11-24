"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

/** 채팅 메뉴 옆 배지: 열려 있는 채팅방 + 응답을 기다리는 직진 수 */
export function ChatBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiFetch("/api/records", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setN((d.chats?.length ?? 0) + (d.straights?.length ?? 0));
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (n <= 0) return null;
  return <span className="absolute -right-3 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-ink">{n}</span>;
}
