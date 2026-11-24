"use client";

import { useEffect, useState } from "react";
import { API_PROBLEM_EVENT, type ApiProblem } from "@/lib/api";

/** 서버와 통신이 안 될 때 화면 아래에 이유를 알려 줘요. (그동안은 몇 초마다 자동으로 다시 시도해요.) */
export function ApiStatus() {
  const [problem, setProblem] = useState<ApiProblem>(null);
  useEffect(() => {
    const on = (e: Event) => setProblem((e as CustomEvent<ApiProblem>).detail);
    window.addEventListener(API_PROBLEM_EVENT, on);
    return () => window.removeEventListener(API_PROBLEM_EVENT, on);
  }, []);
  if (!problem) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
      <p className="font-bold">서버와 연결이 불안정해요</p>
      <p className="mt-0.5">
        {problem.message}
        {problem.status ? ` · 코드 ${problem.status}` : ""} · {problem.path}
      </p>
      <p className="mt-1 text-xs text-red-700">몇 초마다 자동으로 다시 시도해요. 계속되면 운영자에게 위 내용을 알려 주세요.</p>
    </div>
  );
}
