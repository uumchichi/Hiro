// 가입 · 성향 검사 · 상태
import { z } from "zod";
import { analyzePersonality } from "../../_shared/ai.ts";
import { DEFAULT_HABITS, DEFAULT_PREFS, HAIR, normalizePrefs, normalizeTraits } from "../../_shared/compat.ts";
import { computeTraits } from "../../_shared/heuristics.ts";
import { ALL_TAGS, QUESTIONS, REGIONS } from "../../_shared/questions.ts";
import { ALL_CELLS } from "../../_shared/schedule.ts";
import { tx } from "../../_shared/server/db.ts";
import { fail } from "../../_shared/server/http.ts";
import { lockUser } from "../../_shared/server/users.ts";
import { recordPresence } from "../../_shared/notes.ts";
import { viewState } from "../../_shared/state.ts";
import { background, runTick } from "../../_shared/server/tick.ts";
import { inWorld, inWorldTx } from "../../_shared/server/world-tx.ts";
import { ensureWallet } from "../../_shared/server/wallet.ts";
import type { Ctx } from "../router.ts";

/** 내 상태. 대화방 화면은 presence=1로 불러서 1:1 대화가 이어지는지 알려요 (입장권 차감 기준). */
export async function getState(ctx: Ctx) {
  const presence = ctx.url.searchParams.get("presence") === "1";
  const view = await inWorld(() => {
    if (presence) recordPresence(ctx.user.id);
    return viewState(ctx.user.id);
  });
  await background(runTick());
  return view;
}

const ProfileBody = z.object({
  nickname: z.string().trim().min(1).max(12),
  birthYear: z.number().int().min(1950).max(new Date().getFullYear() - 19),
  region: z.enum(REGIONS as [string, ...string[]]),
  bio: z.string().trim().max(300),
  tags: z.array(z.string()).max(12),
  confirmWoman: z.literal(true),
  availability: z.array(z.string()).max(28),
  matchTraits: z.object({
    hair: z.enum(HAIR),
    tg: z.number().int().min(0).max(10).nullable(),
    showTg: z.boolean(),
  }),
  prefs: z
    .object({
      hair: z.array(z.enum(HAIR)),
      tgMin: z.number().int().min(0).max(10),
      tgMax: z.number().int().min(0).max(10),
      platonic: z.enum(["no", "ok", "only"]),
    })
    .refine((p) => p.tgMin <= p.tgMax),
});

export function postProfile(ctx: Ctx): Promise<unknown> {
  const parsed = ProfileBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "입력값을 확인해 주세요. (만 19세 이상, 여성 확인 필수)");
  const d = parsed.data!;
  return tx(async (t) => {
    const u = await lockUser(t, ctx.user.id);
    const profile = { nickname: d.nickname, birthYear: d.birthYear, region: d.region, bio: d.bio, tags: d.tags.filter((x) => ALL_TAGS.includes(x)) };
    // 문담피는 성향 검사에서 받으므로 그대로 둬요.
    const habits = u.matchTraits ? normalizeTraits(u.matchTraits) : DEFAULT_HABITS;
    const matchTraits = { ...d.matchTraits, smoke: habits.smoke, tattoo: habits.tattoo, piercing: habits.piercing };
    const prefs = { ...(u.prefs ? normalizePrefs(u.prefs) : DEFAULT_PREFS), ...d.prefs };
    const availability = d.availability.filter((c) => ALL_CELLS.includes(c));
    await t`
      update users set
        profile = ${t.json(profile)}, match_traits = ${t.json(matchTraits)}, prefs = ${t.json(prefs)},
        availability = ${availability},
        status = case when status = 'new' then 'profiled' else status end
      where id = ${u.id}`;
    await ensureWallet(t, u.id); // 신규 가입 선물: 입장권 + 직진러의 증표
    return inWorldTx(t, () => viewState(u.id));
  });
}

const Want = z.enum(["low", "any", "high"]);
const QuizBody = z.object({
  habits: z.object({
    smoke: z.enum(["none", "ecig", "cig"]),
    tattoo: z.enum(["none", "small", "medium", "large"]),
    piercing: z.enum(["none", "ears", "face"]),
  }),
  allow: z.object({
    smokeMax: z.enum(["none", "ecig", "cig"]),
    tattooMax: z.enum(["none", "small", "medium", "large"]),
    piercingMax: z.enum(["none", "ears", "face"]),
  }),
  answers: z.array(z.number().int().min(1).max(5)).length(QUESTIONS.length),
  partnerWants: z.object({ energy: Want, empathy: Want, planning: Want, openness: Want, expression: Want }),
});

export async function postQuiz(ctx: Ctx) {
  const parsed = QuizBody.safeParse(ctx.body);
  if (!parsed.success) fail(400, "모든 문항에 답해 주세요.");
  const d = parsed.data!;
  if (!ctx.user.profile) fail(400, "프로필을 먼저 작성해 주세요.");
  // Claude 분석은 오래 걸릴 수 있어서 트랜잭션 밖에서 해요 (그동안 행을 잠그지 않도록).
  const traits = computeTraits(d.answers);
  const analysis = await analyzePersonality(ctx.user.profile!, traits, d.partnerWants);
  return tx(async (t) => {
    const u = await lockUser(t, ctx.user.id);
    const matchTraits = u.matchTraits ? { ...normalizeTraits(u.matchTraits), ...d.habits } : null;
    const prefs = { ...(u.prefs ? normalizePrefs(u.prefs) : DEFAULT_PREFS), ...d.allow };
    await t`
      update users set
        answers = ${t.json(d.answers)}, partner_wants = ${t.json(d.partnerWants)},
        match_traits = ${matchTraits ? t.json(matchTraits) : null}, prefs = ${t.json(prefs)},
        analysis = ${t.json(analysis as unknown as Record<string, unknown>)},
        status = case when status in ('new', 'profiled') then 'analyzed' else status end
      where id = ${u.id}`;
    return inWorldTx(t, () => viewState(u.id));
  });
}
