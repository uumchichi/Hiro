"use client";

import { useEffect, useId, useRef } from "react";
import { SPECTRUM } from "@/lib/compat";

/**
 * 목소리에 맞춰 춤추는 오브.
 * getLevels()는 0~1 사이 값의 배열(주파수 대역별 크기)을 돌려줍니다. 매 프레임 읽어서 모양을 바꿉니다.
 * color가 없으면(히로 컬러 비공개) 핑크→퍼플→블루 중립 그라디언트로 그립니다.
 */
export function VoiceOrb({
  getLevels,
  color,
  size = 160,
  label,
  sublabel,
  muted = false,
}: {
  getLevels: () => number[];
  color: string | null;
  size?: number;
  label?: string;
  sublabel?: string;
  muted?: boolean; // 마이크가 꺼져 있으면 흐리게, 소리에 반응하지 않음
}) {
  const uid = useId().replace(/:/g, "");
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGCircleElement>(null);
  const levelsRef = useRef(getLevels);
  levelsRef.current = getLevels;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const POINTS = 72;
    const smooth: number[] = [];
    let level = 0;
    let raf = 0;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const raw = mutedRef.current ? [] : (levelsRef.current() ?? []);
      const bands = raw.length ? raw : [0];
      // 대역마다 부드럽게 따라가기 (올라갈 땐 빠르게, 내려갈 땐 천천히)
      for (let i = 0; i < bands.length; i++) {
        const target = Math.min(1, Math.max(0, bands[i] ?? 0));
        const cur = smooth[i] ?? 0;
        smooth[i] = cur + (target - cur) * (target > cur ? 0.45 : 0.12);
      }
      const avg = smooth.reduce((a, b) => a + b, 0) / smooth.length;
      level += (avg - level) * 0.25;

      const R = 34; // viewBox 100 기준 반지름
      const breathe = reduce ? 0 : Math.sin(t * 1.6) * 0.6; // 말이 없을 때도 살짝 숨쉬기
      const pts: [number, number][] = [];
      for (let p = 0; p < POINTS; p++) {
        const a = (p / POINTS) * Math.PI * 2;
        let r = R + breathe + level * 7;
        if (!reduce) {
          // 대역별로 다른 주파수의 물결을 더해 '춤추는' 모양을 만듭니다.
          for (let k = 0; k < smooth.length; k++) {
            const lobes = 2 + k;
            const phase = t * (0.8 + k * 0.35) * (k % 2 ? -1 : 1);
            r += smooth[k] * (4.5 - k * 0.4) * Math.sin(lobes * a + phase);
          }
        }
        pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
      }
      // 점들을 부드러운 곡선으로 잇기 (Catmull-Rom → 베지어)
      let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
      for (let i = 0; i < POINTS; i++) {
        const p0 = pts[(i - 1 + POINTS) % POINTS];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % POINTS];
        const p3 = pts[(i + 2) % POINTS];
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
      }
      pathRef.current?.setAttribute("d", d + " Z");
      if (glowRef.current) {
        glowRef.current.setAttribute("r", String(R + 6 + level * 16));
        glowRef.current.setAttribute("opacity", String(0.25 + level * 0.55));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const c = color;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="overflow-visible transition-[opacity,filter] duration-300"
        style={muted ? { opacity: 0.4, filter: "grayscale(0.7)" } : undefined}
        aria-hidden
      >
        <defs>
          {c ? (
            <radialGradient id={`fill-${uid}`} cx="38%" cy="32%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
              <stop offset="28%" stopColor={c} stopOpacity="0.85" />
              <stop offset="100%" stopColor={c} />
            </radialGradient>
          ) : (
            <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={SPECTRUM.tek} />
              <stop offset="55%" stopColor={SPECTRUM.mid} />
              <stop offset="100%" stopColor={SPECTRUM.gib} />
            </linearGradient>
          )}
          <radialGradient id={`shine-${uid}`} cx="35%" cy="28%" r="45%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id={`blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        <circle ref={glowRef} cx="50" cy="50" r="40" fill={c ?? SPECTRUM.mid} opacity="0.3" filter={`url(#blur-${uid})`} />
        <path ref={pathRef} fill={`url(#fill-${uid})`} />
        <ellipse cx="42" cy="38" rx="16" ry="11" fill={`url(#shine-${uid})`} />
      </svg>
      {muted && (
        <span className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-sm shadow" title="마이크 꺼짐">
          🔇
        </span>
      )}
      </div>
      {label && (
        <div className="text-center leading-tight">
          <p className="font-bold">{label}</p>
          {(sublabel || muted) && <p className="text-xs text-muted">{muted ? "마이크 꺼짐" : sublabel}</p>}
        </div>
      )}
    </div>
  );
}

/** 브라우저 마이크로 대역별 크기를 읽습니다 (음성 서버 없이 미리 보기용). */
export function createMicMeter(bands = 6) {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let data: Uint8Array<ArrayBuffer> | null = null;
  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaStreamSource(stream).connect(analyser);
      data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    },
    levels(): number[] {
      if (!analyser || !data) return [];
      analyser.getByteFrequencyData(data);
      // 목소리 대역(대략 100Hz~4kHz)만 나눠서 평균
      const lo = 2;
      const hi = Math.min(data.length, 48);
      const step = (hi - lo) / bands;
      const out: number[] = [];
      for (let b = 0; b < bands; b++) {
        let s = 0;
        const from = Math.floor(lo + b * step);
        const to = Math.floor(lo + (b + 1) * step);
        for (let i = from; i < to; i++) s += data[i];
        out.push(Math.min(1, (s / Math.max(1, to - from) / 255) * 1.3));
      }
      return out;
    },
    stop() {
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
      ctx = null;
      analyser = null;
    },
  };
}
