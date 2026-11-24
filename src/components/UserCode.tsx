"use client";

import { useState } from "react";

/** 닉네임 옆 공개 ID. 누르면 복사돼요. */
export function UserCode({ code, className = "" }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  return (
    <button
      type="button"
      title="ID 복사"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(code).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        );
      }}
      className={`rounded-md bg-bg px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wider text-muted hover:text-ink ${className}`}
    >
      {copied ? "복사됨" : `#${code}`}
    </button>
  );
}
