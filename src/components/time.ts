/** 남은 시간: "23시간 5분" / "24시간" / "12분" */
export function fmtRemain(ms: number) {
  if (ms <= 0) return "곧 사라져요";
  const min = Math.ceil(ms / 60000);
  const h = Math.floor(min / 60);
  if (!h) return `${min}분`;
  return min % 60 ? `${h}시간 ${min % 60}분` : `${h}시간`;
}
