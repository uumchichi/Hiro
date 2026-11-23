import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzePersonality } from "@/lib/ai";
import { computeTraits } from "@/lib/heuristics";
import { QUESTIONS } from "@/lib/questions";
import { ensureUser, viewState } from "@/lib/server";
import { mutate } from "@/lib/store";

export const maxDuration = 120;

const Body = z.object({ answers: z.array(z.number().int().min(1).max(5)).length(QUESTIONS.length) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "모든 문항에 답해 주세요." }, { status: 400 });
  const user = await ensureUser();
  if (!user.profile) return NextResponse.json({ error: "프로필을 먼저 작성해 주세요." }, { status: 400 });
  const traits = computeTraits(parsed.data.answers);
  const analysis = await analyzePersonality(user.profile, traits);
  mutate((db) => {
    const u = db.users[user.id];
    u.answers = parsed.data.answers;
    u.analysis = analysis;
    if (u.status === "profiled" || u.status === "new") u.status = "analyzed";
  });
  return NextResponse.json(viewState(user.id));
}
