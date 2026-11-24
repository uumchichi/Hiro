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

/**
 * 앞으로 열릴 수 있는 시간 후보. 서버의 현지 시간 기준이므로 배포할 때 TZ=Asia/Seoul로 설정하세요.
 * minLeadMs 이후, days일 안의 시간대만.
 */
export function upcomingCells(now: number, minLeadMs: number, days = 7) {
  const out: { key: string; startsAt: number }[] = [];
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  for (let d = 0; d <= days; d++) {
    const day = new Date(base.getTime());
    day.setDate(base.getDate() + d);
    for (const b of BANDS) {
      const t = new Date(day.getTime());
      t.setHours(b.hour, 0, 0, 0);
      if (t.getTime() - now >= minLeadMs) out.push({ key: cellKey(t.getDay(), b.id), startsAt: t.getTime() });
    }
  }
  return out;
}

export function fmtSlotTime(ts: number, now = Date.now()) {
  const d = new Date(ts);
  const today = new Date(now);
  const diffDays = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86400000);
  const day = diffDays === 0 ? "오늘" : diffDays === 1 ? "내일" : `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
  const h = d.getHours();
  const band = h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
  return `${day} ${band} ${h % 12 === 0 ? 12 : h % 12}시`;
}
