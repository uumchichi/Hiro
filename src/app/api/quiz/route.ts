import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePersonality } from "@/lib/ai";
import { DEFAULT_PREFS, normalizePrefs, normalizeTraits } from "@/lib/compat";
import { computeTraits } from "@/lib/heuristics";
import { QUESTIONS } from "@/lib/questions";
import { ensureUser, viewState } from "@/lib/server";
import { mutate } from "@/lib/store";

export const maxDuration = 120;

const Want = z.enum(["low", "any", "high"]);
const Body = z.object({
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

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "모든 문항에 답해 주세요." }, { status: 400 });
  const user = await ensureUser();
  if (!user.profile) return NextResponse.json({ error: "프로필을 먼저 작성해 주세요." }, { status: 400 });
  const traits = computeTraits(parsed.data.answers);
  const analysis = await analyzePersonality(user.profile, traits, parsed.data.partnerWants);
  mutate((db) => {
    const u = db.users[user.id];
    u.answers = parsed.data.answers;
    u.partnerWants = parsed.data.partnerWants;
    if (u.matchTraits) u.matchTraits = { ...normalizeTraits(u.matchTraits), ...parsed.data.habits };
    u.prefs = { ...(u.prefs ? normalizePrefs(u.prefs) : DEFAULT_PREFS), ...parsed.data.allow };
    u.analysis = analysis;
    if (u.status === "profiled" || u.status === "new") u.status = "analyzed";
  });
  return NextResponse.json(viewState(user.id));
}
