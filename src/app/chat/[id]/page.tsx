"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtRemain } from "@/components/time";
import type { PublicMember } from "@/lib/server";

interface ChatView {
  now: number;
  id: string;
  expiresAt: number;
  other: PublicMember;
  messages: { id: string; text: string; at: number; mine: boolean }[];
}

// 전화번호, 메신저 ID, SNS 계정, 이메일처럼 보이는 내용
const PRIVATE_PATTERNS = [
  /01[016789][\s.-]?\d{3,4}[\s.-]?\d{4}/,
  /(카톡|카카오|kakao|오픈채팅|라인\s*id|텔레그램|telegram)/i,
  /(인스타|insta|instagram|트위터|twitter|페북|facebook)/i,
  /@[a-z0-9._]{3,}/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /(아이디|id)\s*[:：은는]/i,
];

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [chat, setChat] = useState<ChatView | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [warn, setWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/chat/${id}`, { cache: "no-store" });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setOffset(d.now - Date.now());
      setChat(d);
    } else setGone(d.error ?? "채팅방을 찾을 수 없어요.");
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (chat && chat.messages.length !== lastCount.current) {
      lastCount.current = chat.messages.length;
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [chat]);

  async function send(force = false) {
    const t = text.trim();
    if (!t) return;
    if (!force && PRIVATE_PATTERNS.some((p) => p.test(t))) {
      setWarn(true);
      return;
    }
    setWarn(false);
    setBusy(true);
    const res = await fetch(`/api/chat/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: t }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setChat(d);
      setText("");
    } else setGone(d.error ?? null);
    setBusy(false);
  }

  if (gone && !chat)
    return (
      <div className="card mt-6 space-y-3 text-center">
        <p className="text-4xl">🫧</p>
        <p className="font-bold">{gone}</p>
        <Link href="/lobby" className="btn-primary">대기실로</Link>
      </div>
    );
  if (!chat) return <p className="pt-10 text-center text-muted">불러오는 중…</p>;
  const remain = chat.expiresAt - (Date.now() + offset);

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col gap-3 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-xl">{chat.other.emoji}</span>
          <div>
            <p className="font-bold">{chat.other.nickname}</p>
            <p className="text-xs text-muted">서로의 쪽지 주인을 찾았어요 💞</p>
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">⏳ {fmtRemain(remain)}</span>
      </div>

      <details className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm" open={chat.messages.length === 0}>
        <summary className="cursor-pointer font-semibold">채팅방 안내</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>이 채팅방은 열린 뒤 <b>24시간 동안만</b> 쓸 수 있고, 시간이 지나면 대화 내용과 함께 <b>자동으로 사라져요</b>.</li>
          <li>전화번호, 카톡·SNS 아이디, 주소, 직장 같은 <b>개인 정보는 공유하지 말아 주세요</b>.</li>
          <li>개인 정보 공유로 생기는 일에 대해 히로 운영진은 책임지지 않아요.</li>
          <li>번호 교환은 <b>실제로 만나서</b> 해 주세요. 첫 만남은 사람이 많은 공공장소를 추천해요.</li>
        </ul>
      </details>

      <div className="flex-1 space-y-2 overflow-y-auto rounded-3xl border border-line bg-surface p-4">
        {chat.messages.length === 0 && <p className="py-10 text-center text-sm text-muted">첫 인사를 건네 보세요 👋</p>}
        {chat.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-[15px] ${
                m.mine ? "bg-hiro text-white" : "bg-brand-soft"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {warn && (
        <div className="space-y-2 rounded-2xl border border-[var(--platonic)] bg-[color-mix(in_srgb,var(--platonic)_15%,transparent)] px-4 py-3 text-sm">
          <p className="font-semibold">개인 정보가 들어 있는 것 같아요.</p>
          <p className="text-muted">번호나 아이디는 실제로 만나서 교환하는 걸 권해요. 공유로 생기는 일에 대해 운영진은 책임지지 않아요.</p>
          <div className="flex gap-2">
            <button className="btn-ghost py-2 text-sm" onClick={() => setWarn(false)}>고칠게요</button>
            <button className="btn-ghost py-2 text-sm" onClick={() => send(true)}>그래도 보내기</button>
          </div>
        </div>
      )}
      {gone && <p className="text-sm font-semibold text-brand">{gone}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input className="input" value={text} maxLength={1000} placeholder="메시지 보내기" onChange={(e) => setText(e.target.value)} aria-label="메시지" />
        <button className="btn-primary shrink-0" disabled={busy || !text.trim()}>
          보내기
        </button>
      </form>
    </div>
  );
}
