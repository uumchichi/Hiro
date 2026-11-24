"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletView } from "@/lib/wallet";

const ITEM = { doki: "도키", ticket: "입장권", badge: "직진러의 증표" } as const;
const KIND: Record<string, string> = { starter: "가입 선물", grant: "지급", charge: "충전", exchange: "바꾸기", use: "사용", release: "돌려받음" };

export default function WalletPage() {
  const [w, setW] = useState<WalletView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/wallet", { cache: "no-store" });
    if (res.ok) setW(await res.json());
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function swap(item: "ticket" | "badge", count: number) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "exchange", item, count }) });
    const d = await res.json().catch(() => ({}));
    if (d.doki !== undefined) setW(d);
    setMsg(res.ok ? `${ITEM[item]} ${count}개로 바꿨어요.` : (d.error ?? "바꾸지 못했어요."));
    setBusy(false);
  }

  if (!w) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;

  return (
    <div className="space-y-5 pt-4">
      <h1 className="text-2xl font-extrabold">내 지갑</h1>

      <section className="relative overflow-hidden rounded-[2rem] bg-hiro px-6 py-7 text-white">
        <span className="orb -right-8 -top-8 h-28 w-28" aria-hidden />
        <p className="relative text-sm font-semibold text-white/85">보유 도키</p>
        <p className="relative mt-1 text-4xl font-extrabold tabular-nums">{w.doki.toLocaleString()} <span className="text-xl">도키</span></p>
        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
            <p className="text-xs text-white/85">🎟️ 입장권</p>
            <p className="text-2xl font-extrabold tabular-nums">{w.tickets}장</p>
            {w.heldTickets > 0 && <p className="text-xs text-white/85">그중 {w.heldTickets}장은 진행 중인 로테이션에 맡겨 둠</p>}
          </div>
          <div className="rounded-2xl bg-white/15 px-4 py-3 backdrop-blur">
            <p className="text-xs text-white/85">💘 직진러의 증표</p>
            <p className="text-2xl font-extrabold tabular-nums">{w.badges}개</p>
            {w.heldBadges > 0 && <p className="text-xs text-white/85">그중 {w.heldBadges}개는 답을 기다리는 직진에 맡겨 둠</p>}
          </div>
        </div>
      </section>

      {msg && <p className="rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold">{msg}</p>}

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">도키로 바꾸기</h2>
        <p className="text-sm text-muted">미리 바꿔 두면 필요할 때 바로 쓸 수 있어요.</p>
        {(
          [
            ["ticket", "🎟️ 입장권", w.prices.ticket, `로테이션 1회에 1장. 첫 1:1 대화가 ${w.ticketAfterSeconds}초 이상 이어졌을 때 차감돼요. 오류나 대화 상대가 없어 성사되지 않으면 돌려드려요.`],
            ["badge", "💘 직진러의 증표", w.prices.badge, "직진 1회에 1개. 상대가 수락했을 때 차감되고, 거절하거나 응답이 없으면 돌려드려요."],
          ] as const
        ).map(([item, name, price, desc]) => (
          <div key={item} className="rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">
                {name} <span className="font-normal text-muted">· {price}도키</span>
              </p>
              <div className="flex gap-2">
                {[1, 3].map((n) => (
                  <button key={n} className="btn-ghost py-2 text-sm" disabled={busy || w.doki < price * n} onClick={() => swap(item, n)}>
                    {n}개 ({price * n}도키)
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{desc}</p>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">도키 충전</h2>
        <div className="grid grid-cols-3 gap-2">
          {w.packs.map((p) => (
            <div key={p.doki} className="rounded-2xl border border-line p-3 text-center">
              <p className="text-lg font-extrabold">{p.doki}도키</p>
              <p className="text-sm text-muted">{p.price.toLocaleString()}원</p>
              {p.bonus > 0 && <p className="mt-1 text-xs font-semibold text-brand">+{p.bonus}% 보너스</p>}
            </div>
          ))}
        </div>
        <p className="rounded-2xl bg-bg px-4 py-3 text-sm text-muted">💳 결제는 준비 중이에요. 지금은 이벤트나 운영진 지급으로 도키를 받을 수 있어요.</p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-bold">사용 내역</h2>
        {w.history.length === 0 && <p className="text-sm text-muted">아직 내역이 없어요.</p>}
        <ul className="divide-y divide-line">
          {w.history.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">{t.note}</p>
                <p className="text-xs text-muted">
                  {KIND[t.kind] ?? t.kind} · {new Date(t.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <span className={`shrink-0 font-semibold tabular-nums ${t.amount > 0 ? "text-ok" : t.amount < 0 ? "text-brand" : "text-muted"}`}>
                {t.amount > 0 ? "+" : ""}
                {t.amount !== 0 ? `${t.amount} ${ITEM[t.item]}` : ITEM[t.item]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
