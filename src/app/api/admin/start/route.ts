import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/server";
import { mutate, readDb } from "@/lib/store";

const Body = z.object({
  groupId: z.string(),
  roundSeconds: z.number().int().min(30).max(1800).optional(),
  breakSeconds: z.number().int().min(5).max(120).optional(),
});

/** 로테이션 시작. 10초 카운트다운 뒤 1라운드가 시작됩니다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const { groupId, roundSeconds, breakSeconds } = parsed.data;
  if (!readDb().groups[groupId]) return NextResponse.json({ error: "그룹이 없어요." }, { status: 404 });
  mutate((db) => {
    const g = db.groups[groupId];
    if (roundSeconds) g.roundSeconds = roundSeconds;
    if (breakSeconds) g.breakSeconds = breakSeconds;
    g.startedAt = Date.now() + 10_000;
    g.status = "live";
    g.choices = {};
    g.submitted = [];
  });
  return NextResponse.json({ ok: true });
}
