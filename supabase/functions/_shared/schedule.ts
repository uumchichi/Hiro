// 선호 시간대: 요일 × 시간대
export const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
export const BANDS = [
  { id: "morning", label: "오전", hour: 10, range: "10~12시" },
  { id: "afternoon", label: "오후", hour: 14, range: "14~17시" },
  { id: "evening", label: "저녁", hour: 19, range: "19~21시" },
  { id: "night", label: "밤", hour: 21, range: "21~23시" },
] as const;

/** 화면 순서: 월~일 */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function cellKey(day: number, band: string) {
  return `${day}-${band}`;
}

export const ALL_CELLS = DAY_ORDER.flatMap((d) => BANDS.map((b) => cellKey(d, b.id)));

// ── 한국 시간 ──
// 서버(Supabase 서버 함수는 UTC)나 브라우저의 시간대와 상관없이 항상 한국 시간(UTC+9, 서머타임 없음)으로 계산해요.
const KST_MS = 9 * 3600_000;
const DAY_MS = 86400_000;

/** 한국 시간의 요일·날짜·시각 */
export function kst(ts: number) {
  const d = new Date(ts + KST_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, date: d.getUTCDate(), day: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** ts가 속한 한국 날짜의 0시 (UTC 기준 ms) */
export function kstMidnight(ts: number) {
  return Math.floor((ts + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
}

/**
 * 앞으로 열릴 수 있는 시간 후보 (한국 시간 기준). minLeadMs 이후, days일 안의 시간대만.
 */
export function upcomingCells(now: number, minLeadMs: number, days = 7) {
  const out: { key: string; startsAt: number }[] = [];
  const base = kstMidnight(now);
  for (let d = 0; d <= days; d++) {
    const day = base + d * DAY_MS;
    for (const b of BANDS) {
      const t = day + b.hour * 3600_000;
      if (t - now >= minLeadMs) out.push({ key: cellKey(kst(t).day, b.id), startsAt: t });
    }
  }
  return out;
}

export function fmtSlotTime(ts: number, now = Date.now()) {
  const d = kst(ts);
  const diffDays = Math.round((kstMidnight(ts) - kstMidnight(now)) / DAY_MS);
  const day = diffDays === 0 ? "오늘" : diffDays === 1 ? "내일" : `${d.month}월 ${d.date}일 ${DAYS[d.day]}요일`;
  const h = d.hour;
  const band = h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
  return `${day} ${band} ${h % 12 === 0 ? 12 : h % 12}시`;
}
