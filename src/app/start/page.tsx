"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro } from "@/components/useHiro";
import { DEFAULT_PREFS, HAIR, tgColor, tgLabel, type Hair, type MatchPrefs, type MatchTraits } from "@/lib/compat";
import { REGIONS, TAG_GROUPS } from "@/lib/questions";

const DEFAULT_TRAITS: MatchTraits = { hair: "단머", tg: 5, showTg: true, tattoo: false, smoke: false, piercing: false };

function Seg<T extends string | boolean>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={String(o.v)} onClick={() => onChange(o.v)} aria-pressed={value === o.v} className={`chip ${value === o.v ? "chip-on" : ""}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function StartPage() {
  const router = useRouter();
  const { state, post, error } = useHiro();
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [region, setRegion] = useState("서울");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [confirmWoman, setConfirmWoman] = useState(false);
  const [mt, setMt] = useState<MatchTraits>(DEFAULT_TRAITS);
  const [pf, setPf] = useState<MatchPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = state?.user.profile;
    if (!p) return;
    setNickname(p.nickname);
    setBirthYear(String(p.birthYear));
    setRegion(p.region);
    setBio(p.bio);
    setTags(p.tags);
    if (state?.user.matchTraits) setMt(state.user.matchTraits);
    if (state?.user.prefs) setPf(state.user.prefs);
  }, [state?.user.profile, state?.user.matchTraits, state?.user.prefs]);

  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 12 ? cur : [...cur, t]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await post("/api/profile", { nickname, birthYear: Number(birthYear), region, bio, tags, confirmWoman, matchTraits: mt, prefs: pf });
    setBusy(false);
    if (ok) router.push(state?.user.analysis ? "/me" : "/quiz");
  }

  return (
    <form onSubmit={submit} className="space-y-6 pt-4">
      <div>
        <h1 className="text-2xl font-extrabold">프로필 만들기</h1>
        <p className="mt-1 text-muted">대화 상대에게 보여질 기본 정보예요. 실명은 필요 없어요.</p>
      </div>

      <div className="card grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nick">닉네임</label>
          <input id="nick" className="input" maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="예: 윤슬" required />
        </div>
        <div>
          <label className="label" htmlFor="by">출생연도</label>
          <input id="by" className="input" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="예: 1996" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="region">지역</label>
          <select id="region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="bio">한 줄 소개</label>
          <textarea id="bio" className="input min-h-24" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="요즘 빠져 있는 것, 좋아하는 주말 풍경 등" />
        </div>
      </div>

      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-bold">나의 만남 성향</h2>
          <p className="text-sm text-muted">매칭에만 쓰이고, 텍깁은 공개 여부를 고를 수 있어요.</p>
        </div>
        <div>
          <p className="label">머리 길이</p>
          <Seg value={mt.hair} options={HAIR.map((h) => ({ v: h, label: h }))} onChange={(hair) => setMt({ ...mt, hair })} />
        </div>
        <div>
          <p className="label">텍깁</p>
          <label className="mb-3 flex items-center gap-2 text-[15px]">
            <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={mt.tg === null} onChange={(e) => setMt({ ...mt, tg: e.target.checked ? null : 5 })} />
            플라토닉이에요
            {mt.tg === null && (
              <span className="ml-1 rounded-full px-2 py-0.5 text-xs font-bold text-ink" style={{ background: tgColor(null) }}>
                플라토닉
              </span>
            )}
          </label>
          {mt.tg !== null && (
            <div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={mt.tg}
                onChange={(e) => setMt({ ...mt, tg: Number(e.target.value) })}
                className="tg-range w-full"
                style={{ ["--thumb" as string]: tgColor(mt.tg) }}
                aria-label="텍깁"
              />
              <div className="flex justify-between text-xs text-muted">
                <span>0 온텍</span>
                <span className="font-bold" style={{ color: tgColor(mt.tg) }}>{tgLabel(mt.tg)}</span>
                <span>온깁 10</span>
              </div>
            </div>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={mt.showTg} onChange={(e) => setMt({ ...mt, showTg: e.target.checked })} />
            같은 그룹 사람들에게 텍깁 보여주기
          </label>
        </div>
        <div>
          <p className="label">문담피</p>
          <div className="space-y-2">
            {(["tattoo", "smoke", "piercing"] as const).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <span className="text-[15px]">{{ tattoo: "문신", smoke: "담배", piercing: "피어싱" }[k]}</span>
                <Seg value={mt[k]} options={[{ v: false, label: "없어요" }, { v: true, label: "있어요" }]} onChange={(v) => setMt({ ...mt, [k]: v })} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-bold">원하는 상대</h2>
          <p className="text-sm text-muted">여기서 고른 조건은 <b>필수 조건</b>이에요. 서로의 조건이 맞는 사람끼리만 같은 그룹이 돼요. 너무 좁히면 매칭이 늦어질 수 있어요.</p>
        </div>
        <div>
          <p className="label">머리 길이 (안 고르면 상관없음)</p>
          <div className="flex flex-wrap gap-2">
            {HAIR.map((h: Hair) => {
              const on = pf.hair.includes(h);
              return (
                <button type="button" key={h} aria-pressed={on} className={`chip ${on ? "chip-on" : ""}`} onClick={() => setPf({ ...pf, hair: on ? pf.hair.filter((x) => x !== h) : [...pf.hair, h] })}>
                  {h}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="label">텍깁</p>
          <Seg
            value={pf.platonic}
            options={[
              { v: "ok", label: "플라토닉도 괜찮아요" },
              { v: "no", label: "플라토닉은 아니었으면" },
              { v: "only", label: "플라토닉만" },
            ]}
            onChange={(platonic) => setPf({ ...pf, platonic })}
          />
          {pf.platonic !== "only" && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">최소</span>
                <select className="input py-2" value={pf.tgMin} onChange={(e) => setPf({ ...pf, tgMin: Number(e.target.value), tgMax: Math.max(pf.tgMax, Number(e.target.value)) })}>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>{tgLabel(i)}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">최대</span>
                <select className="input py-2" value={pf.tgMax} onChange={(e) => setPf({ ...pf, tgMax: Number(e.target.value), tgMin: Math.min(pf.tgMin, Number(e.target.value)) })}>
                  {Array.from({ length: 11 }, (_, i) => (
                    <option key={i} value={i}>{tgLabel(i)}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
        <div>
          <p className="label">문담피</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["noTattoo", "문신 없는 사람만"],
                ["noSmoke", "비흡연자만"],
                ["noPiercing", "피어싱 없는 사람만"],
              ] as const
            ).map(([k, label]) => (
              <button type="button" key={k} aria-pressed={pf[k]} className={`chip ${pf[k] ? "chip-on" : ""}`} onClick={() => setPf({ ...pf, [k]: !pf[k] })}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-5">
        <div>
          <h2 className="text-lg font-bold">나를 설명하는 태그</h2>
          <p className="text-sm text-muted">AI가 이 태그로 ‘기독교인 모임’, ‘고양이 집사 모임’ 같은 테마 그룹을 만들어요. (최대 12개)</p>
        </div>
        {TAG_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="mb-2 text-sm font-semibold">{g.label}</p>
            <div className="flex flex-wrap gap-2">
              {g.tags.map((t) => (
                <button type="button" key={t} onClick={() => toggle(t)} className={`chip ${tags.includes(t) ? "chip-on" : ""}`} aria-pressed={tags.includes(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="flex items-start gap-3 text-[15px]">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--brand)]" checked={confirmWoman} onChange={(e) => setConfirmWoman(e.target.checked)} />
        <span>
          저는 만 19세 이상 여성이며, 히로가 여성 전용 서비스임을 이해합니다.
          <span className="block text-sm text-muted">정식 서비스에서는 본인인증으로 확인할 예정이에요.</span>
        </span>
      </label>

      {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !confirmWoman || !nickname || birthYear.length !== 4}>
        {busy ? "저장 중…" : "저장하고 다음으로"}
      </button>
    </form>
  );
}
