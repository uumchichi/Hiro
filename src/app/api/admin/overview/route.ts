import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { GROUP_MAX, GROUP_MIN } from "@/lib/heuristics";
import { currentPhase } from "@/lib/rotation";
import { isAdmin, livekitConfigured, syncGroupStatus } from "@/lib/server";
import { isPresent, processDueSlots } from "@/lib/slots";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const now = Date.now();
  processDueSlots(now);
  const db = readDb();
  const users = Object.values(db.users);
  const name = (id: string) => db.users[id]?.profile?.nickname ?? id;
  const groups = Object.values(db.groups)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map((g) => {
      syncGroupStatus(g);
      return {
        id: g.id,
        theme: g.theme,
        status: g.status,
        members: g.memberIds.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo })),
        roundCount: g.rounds.length,
        roundSeconds: g.roundSeconds,
        phase: currentPhase(g),
        submitted: g.submitted.length,
      };
    });
  const slots = Object.values(db.slots)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((s) => ({
      id: s.id,
      theme: s.theme,
      startsAt: s.startsAt,
      status: s.status,
      applicants: s.applicants.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo, present: isPresent(s, id, now) })),
      note: s.note ?? null,
    }));
  return NextResponse.json({
    now,
    config: { ai: aiEnabled(), voice: livekitConfigured(), groupMin: GROUP_MIN, groupMax: GROUP_MAX },
    counts: {
      total: users.length,
      real: users.filter((u) => !u.isDemo).length,
      demo: users.filter((u) => u.isDemo).length,
      grouped: users.filter((u) => u.status === "grouped").length,
    },
    catalog: db.catalog ? { source: db.catalog.source, note: db.catalog.note, createdAt: db.catalog.createdAt, count: db.catalog.themes.length } : null,
    slots,
    groups,
  });
}
