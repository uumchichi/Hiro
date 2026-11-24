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

  async function toggleAuto(on: boolean) {
    // 바로 반영하고, 서버 저장이 실패하면 되돌려요.
    setW((cur) => (cur ? { ...cur, autoExchange: on } : cur));
    const res = await fetch("/api/wallet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "autoExchange", on }) }).catch(() => null);
    if (res?.ok) {
      setW(await res.json());
      setMsg(on ? "자동 교환을 켰어요." : "자동 교환을 껐어요.");
    } else {
      setW((cur) => (cur ? { ...cur, autoExchange: !on } : cur));
      setMsg("설정을 바꾸지 못했어요. 다시 시도해 주세요.");
    }
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
            {w.heldTickets > 0 && <p className="text-xs text-white/85">그중 {w.heldTickets}장은 진행 중인 로테이션에 예치 중</p>}
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
        <p className="text-sm text-muted">많이 바꿀수록 할인돼요. 바꾼 입장권·증표는 도키로 되돌리거나 환불할 수 없어요.</p>
        {(
          [
            ["ticket", "🎟️ 입장권", `1:1 대화 1번에 1장. 그룹에 들어갈 때 나와 대화할 사람 수만큼 예치하고, 대화가 ${w.ticketAfterSeconds}초 이상 이어질 때마다 1장씩 차감돼요. 남은 건 로테이션이 끝나면 돌려드려요. 예치할 입장권이 모자라면 그 로테이션에는 들어갈 수 없어요.`],
            ["badge", "💘 직진러의 증표", "직진 1회에 1개. 상대가 수락했을 때 차감되고, 거절하거나 응답이 없으면 돌려드려요."],
          ] as const
        ).map(([item, name, desc]) => (
          <div key={item} className="rounded-2xl border border-line p-4">
            <p className="font-bold">{name}</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {w.bundles[item].map((b) => (
                <button
                  key={b.count}
                  className="flex flex-col items-center rounded-2xl border border-line px-2 py-2.5 text-sm hover:border-brand disabled:opacity-40"
                  disabled={busy || w.doki < b.price}
                  onClick={() => swap(item, b.count)}
                >
                  <span className="font-bold">{b.count}개</span>
                  <span>
                    {b.discount > 0 && <span className="mr-1 text-xs text-muted line-through">{b.full}</span>}
                    {b.price}도키
                  </span>
                  {b.discount > 0 && <span className="text-xs font-semibold text-brand">{b.discount}% 할인</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{desc}</p>
          </div>
        ))}
        <label className="flex items-start gap-3 rounded-2xl bg-bg px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 accent-[var(--brand)]"
            checked={w.autoExchange}
            onChange={(e) => toggleAuto(e.target.checked)}
          />
          <span>
            <b>자동 교환</b>: 입장권이나 증표가 모자랄 때, 실제로 필요한 순간(그룹에 들어갈 때, 직진을 보낼 때)에만 모자란 만큼 도키로 바꿔요 (입장권 1장 {w.prices.ticket}도키, 증표 1개 {w.prices.badge}도키).
          </span>
        </label>
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
