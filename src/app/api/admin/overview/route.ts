import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { GROUP_MAX, GROUP_MIN } from "@/lib/heuristics";
import { currentPhase } from "@/lib/rotation";
import { isAdmin, livekitConfigured, syncGroupStatus } from "@/lib/server";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const db = readDb();
  const users = Object.values(db.users);
  const name = (id: string) => db.users[id]?.profile?.nickname ?? id;
  const groups = Object.values(db.groups)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((g) => {
      syncGroupStatus(g);
      return {
        id: g.id,
        theme: g.theme,
        reason: g.reason,
        status: g.status,
        members: g.memberIds.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo })),
        roundCount: g.rounds.length,
        roundSeconds: g.roundSeconds,
        phase: currentPhase(g),
        submitted: g.submitted.length,
      };
    });
  return NextResponse.json({
    now: Date.now(),
    config: { ai: aiEnabled(), voice: livekitConfigured(), groupMin: GROUP_MIN, groupMax: GROUP_MAX },
    counts: {
      total: users.length,
      waiting: users.filter((u) => u.status === "waiting").length,
      grouped: users.filter((u) => u.status === "grouped").length,
    },
    waiting: users
      .filter((u) => u.status === "waiting")
      .map((u) => ({ id: u.id, nickname: name(u.id), demo: u.isDemo, typeName: u.analysis?.typeName, tags: u.profile?.tags ?? [] })),
    groups,
    lastRun: db.matchRuns[db.matchRuns.length - 1] ?? null,
  });
}
