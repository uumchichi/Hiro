import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { BREAK_SECONDS } from "@/lib/groups";
import { GROUP_MAX, GROUP_MIN } from "@/lib/heuristics";
import { currentPhase } from "@/lib/rotation";
import { isAdmin, livekitConfigured, syncGroupStatus } from "@/lib/server";
import { isOnline, processLobby } from "@/lib/lobby";
import { isPresent, processDueSlots } from "@/lib/slots";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const now = Date.now();
  processDueSlots(now);
  processLobby(now);
  const db = readDb();
  const users = Object.values(db.users);
  const name = (id: string) => `${db.users[id]?.profile?.nickname ?? "참가자"} #${db.users[id]?.code ?? "?"}`;
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
        letters: Object.values(g.letters).reduce((n, m) => n + Object.keys(m).length, 0),
      };
    });
  const slots = Object.values(db.slots)
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((s) => ({
      id: s.id,
      theme: s.theme,
      startsAt: s.startsAt,
      status: s.status,
      curated: Boolean(s.curated),
      capacity: s.capacity ?? null,
      roundSeconds: s.roundSeconds ?? null,
      applicants: s.applicants.map((id) => ({ id, nickname: name(id), demo: !!db.users[id]?.isDemo, present: isPresent(s, id, now) })),
      note: s.note ?? null,
    }));
  return NextResponse.json({
    now,
    config: { ai: aiEnabled(), voice: livekitConfigured(), groupMin: GROUP_MIN, groupMax: GROUP_MAX, breakSeconds: BREAK_SECONDS() },
    counts: {
      total: users.length,
      real: users.filter((u) => !u.isDemo).length,
      demo: users.filter((u) => u.isDemo).length,
      grouped: users.filter((u) => u.status === "grouped").length,
    },
    catalog: db.catalog ? { source: db.catalog.source, note: db.catalog.note, createdAt: db.catalog.createdAt, count: db.catalog.themes.length } : null,
    slots,
    groups,
    reports: [...db.reports]
      .sort((a, b) => b.at - a.at)
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        at: r.at,
        target: r.targetId ? name(r.targetId) : `#${r.targetCode}`,
        reporter: name(r.reporterId),
        reason: r.reason,
        detail: r.detail,
        context: r.context,
        status: r.status,
        targetReports: db.reports.filter((x) => x.targetCode === r.targetCode).length,
      })),
    lobby: Object.entries(db.lobby)
      .map(([id, e]) => ({
        id,
        nickname: name(id),
        demo: !!db.users[id]?.isDemo,
        online: isOnline(db, id, now),
        priority: e.priority,
        waitedSec: Math.round((now - e.joinedAt) / 1000),
        interests: e.interests.length,
      }))
      .sort((a, b) => b.waitedSec - a.waitedSec),
    invites: Object.values(db.invites)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        startsAt: i.startsAt ?? null,
        theme: i.theme,
        status: i.status,
        source: i.source,
        expiresAt: i.expiresAt,
        invitees: i.invitees.map((id) => ({
          nickname: name(id),
          state: i.accepted.includes(id) ? "accepted" : i.declined.includes(id) ? "declined" : "pending",
        })),
      })),
  });
}
