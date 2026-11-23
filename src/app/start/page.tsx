"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHiro } from "@/components/useHiro";
import { REGIONS, TAG_GROUPS } from "@/lib/questions";

export default function StartPage() {
  const router = useRouter();
  const { state, post, error } = useHiro();
  const [nickname, setNickname] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [region, setRegion] = useState("서울");
  const [bio, setBio] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [confirmWoman, setConfirmWoman] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = state?.user.profile;
    if (!p) return;
    setNickname(p.nickname);
    setBirthYear(String(p.birthYear));
    setRegion(p.region);
    setBio(p.bio);
    setTags(p.tags);
  }, [state?.user.profile]);

  const toggle = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 12 ? cur : [...cur, t]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await post("/api/profile", { nickname, birthYear: Number(birthYear), region, bio, tags, confirmWoman });
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
