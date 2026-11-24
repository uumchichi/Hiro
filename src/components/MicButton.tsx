"use client";

/** 마이크 켜기/끄기 버튼 */
export function MicButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        aria-label={on ? "마이크 끄기" : "마이크 켜기"}
        className={`grid h-16 w-16 place-items-center rounded-full text-2xl transition active:scale-95 disabled:opacity-50 ${
          on ? "bg-hiro text-white shadow-[0_8px_24px_-8px_rgba(138,77,255,0.7)]" : "border-2 border-brand bg-surface"
        }`}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={on ? "" : "text-brand"} aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          {!on && <path d="M4 4l16 16" />}
        </svg>
      </button>
      <span className={`text-xs font-semibold ${on ? "text-muted" : "text-brand"}`}>{on ? "마이크 켜짐" : "마이크 꺼짐 · 상대에게 안 들려요"}</span>
    </div>
  );
}
