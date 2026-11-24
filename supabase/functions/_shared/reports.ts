// 신고: 공개 ID(5글자)로 접수해요.
import { mutate, newId, normalizeCode } from "./world.ts";

export const REPORT_REASONS = ["불쾌한 말이나 행동", "개인 정보 요구", "성희롱·혐오 발언", "광고·사기 의심", "기타"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function reportUser(reporterId: string, rawCode: string, reason: ReportReason, detail: string, context: string): string | null {
  const code = normalizeCode(rawCode);
  return mutate((db) => {
    const target = Object.values(db.users).find((u) => u.code === code);
    if (!target) return "해당 ID의 사용자를 찾을 수 없어요.";
    if (target.id === reporterId) return "나 자신은 신고할 수 없어요.";
    db.reports.push({
      id: newId("rep"),
      at: Date.now(),
      reporterId,
      targetCode: code,
      targetId: target.id,
      reason,
      detail: detail.trim(),
      context,
      status: "new",
    });
    return null;
  });
}
