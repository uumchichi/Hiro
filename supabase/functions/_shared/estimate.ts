import { kst } from "./schedule.ts";
// 로테이션 예상 라운드 수와 시간
// 짝수 인원: 인원-1 라운드 (모두가 서로 한 번씩). 홀수 인원: 인원과 같은 수의 라운드 (라운드마다 한 명씩 쉬어요).

export function roundsFor(people: number) {
  if (people < 2) return 0;
  return people % 2 === 0 ? people - 1 : people;
}

/** 첫 라운드 시작부터 마지막 라운드 끝까지 (라운드 사이 쉬는 시간 포함) */
export function durationMs(people: number, roundSeconds: number, breakSeconds: number) {
  const r = roundsFor(people);
  if (!r) return 0;
  return (r * roundSeconds + (r - 1) * breakSeconds) * 1000;
}

function fmtMinutes(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}분`;
  return m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`;
}

function fmtRound(seconds: number) {
  return seconds < 60 ? `${seconds}초` : `${Math.round(seconds / 60)}분`;
}

/** 인원이 정해지기 전: "4~6명 · 3~5라운드 · 약 16~27분" */
export function estimateRange(min: number, max: number, roundSeconds: number, breakSeconds: number) {
  // 범위 안에서 가장 짧은/긴 경우
  let lo = Infinity;
  let hi = 0;
  let rLo = Infinity;
  let rHi = 0;
  for (let n = min; n <= max; n++) {
    const d = durationMs(n, roundSeconds, breakSeconds);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
    rLo = Math.min(rLo, roundsFor(n));
    rHi = Math.max(rHi, roundsFor(n));
  }
  const rounds = rLo === rHi ? `${rLo}라운드` : `${rLo}~${rHi}라운드`;
  const time = lo === hi ? `약 ${fmtMinutes(lo)}` : `약 ${fmtMinutes(lo).replace("분", "")}~${fmtMinutes(hi)}`;
  return {
    rounds,
    time,
    text: `${min === max ? `${min}명` : `${min}~${max}명`} · ${rounds} · 라운드당 ${fmtRound(roundSeconds)} · ${time}`,
  };
}

/** 인원이 정해진 뒤: "6명 · 5라운드 · 라운드당 5분 · 약 27분" */
export function estimateExact(people: number, roundSeconds: number, breakSeconds: number) {
  const ms = durationMs(people, roundSeconds, breakSeconds);
  return { rounds: roundsFor(people), ms, text: `${people}명 · ${roundsFor(people)}라운드 · 라운드당 ${fmtRound(roundSeconds)} · 약 ${fmtMinutes(ms)}` };
}

/** 실제 일정(라운드 수)이 정해진 뒤: 끝나는 데 걸리는 시간 */
export function durationForRounds(rounds: number, roundSeconds: number, breakSeconds: number) {
  if (!rounds) return 0;
  return (rounds * roundSeconds + (rounds - 1) * breakSeconds) * 1000;
}

/** 그룹이 정해진 뒤: "나는 4명과 대화해요 · 총 5라운드 · 라운드당 5분 · 약 26분" */
export function estimateMine(myPartners: number, rounds: number, roundSeconds: number, breakSeconds: number) {
  const ms = durationForRounds(rounds, roundSeconds, breakSeconds);
  return `나는 ${myPartners}명과 대화해요 · 총 ${rounds}라운드 · 라운드당 ${fmtRound(roundSeconds)} · 약 ${fmtMinutes(ms)}`;
}

export function fmtClockTime(ts: number) {
  const { hour: h, minute } = kst(ts); // 항상 한국 시간
  return `${h < 12 ? "오전" : "오후"} ${h % 12 === 0 ? 12 : h % 12}:${String(minute).padStart(2, "0")}`;
}
