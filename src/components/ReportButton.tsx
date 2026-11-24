"use client";

import { useState } from "react";
import { REPORT_REASONS } from "@/lib/reports";
import { apiFetch } from "@/lib/api";

/** 공개 ID로 신고하기. code를 주면 그 사람으로 고정, 없으면 ID를 직접 입력해요. */
export function ReportButton({ code, nickname, context = "", className = "" }: { code?: string; nickname?: string; context?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(code ?? "");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setErr(null);
    const res = await apiFetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: target, reason, detail, context }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setState("done");
    else {
      setErr(d.error ?? "신고하지 못했어요.");
      setState("idle");
    }
  }

  function close() {
    setOpen(false);
    setState("idle");
    setErr(null);
    setDetail("");
    if (!code) setTarget("");
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={className || "text-xs font-semibold text-muted underline hover:text-brand"}
      >
        🚩 신고
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-label="신고하기">
          <div className="w-full max-w-md space-y-4 rounded-[2rem] bg-surface p-6 shadow-2xl">
            {state === "done" ? (
              <div className="space-y-3 text-center">
                <p className="text-3xl">🛡️</p>
                <p className="text-lg font-bold">신고가 접수됐어요</p>
                <p className="text-sm text-muted">운영진이 확인할게요. 신고한 사실은 상대에게 알려지지 않아요.</p>
                <button className="btn-primary w-full" onClick={close}>닫기</button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-lg font-bold">신고하기</p>
                  <p className="text-sm text-muted">신고는 공개 ID로 접수돼요. 신고한 사실은 상대에게 알려지지 않아요.</p>
                </div>
                {code ? (
                  <p className="rounded-2xl bg-bg px-4 py-3 text-sm">
                    대상: <b>{nickname}</b> <span className="font-mono font-semibold">#{code}</span>
                  </p>
                ) : (
                  <label className="block">
                    <span className="label">신고할 사람의 ID</span>
                    <input className="input font-mono uppercase" placeholder="예: K7M2Q" maxLength={6} value={target} onChange={(e) => setTarget(e.target.value)} />
                  </label>
                )}
                <div className="space-y-2" role="radiogroup" aria-label="신고 사유">
                  {REPORT_REASONS.map((r) => (
                    <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm ${reason === r ? "border-brand bg-brand-soft font-semibold" : "border-line"}`}>
                      <input type="radio" name="reason" className="accent-[var(--brand)]" checked={reason === r} onChange={() => setReason(r)} />
                      {r}
                    </label>
                  ))}
                </div>
                <textarea className="input min-h-20 text-sm" maxLength={1000} placeholder="어떤 일이 있었는지 적어 주세요 (선택)" value={detail} onChange={(e) => setDetail(e.target.value)} />
                {err && <p className="text-sm font-semibold text-brand">{err}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-ghost" onClick={close}>취소</button>
                  <button className="btn-primary" disabled={state === "sending" || target.trim().length < 4} onClick={submit}>
                    신고하기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
