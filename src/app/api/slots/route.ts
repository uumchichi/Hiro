import { NextResponse } from "next/server";
import { BREAK_SECONDS, ROUND_SECONDS } from "@/lib/groups";
import { GROUP_MAX, GROUP_MIN } from "@/lib/heuristics";
import { ensureUser } from "@/lib/server";
import { CHECKIN_OPEN_MS, canCheckIn, isPresent, processDueSlots } from "@/lib/slots";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 테마 게시판: 앞으로 열릴 세션과 내가 신청한 세션 */
export async function GET() {
  const user = await ensureUser();
  const now = Date.now();
  processDueSlots(now);
  const db = readDb();
  const slots = Object.values(db.slots)
    .filter((s) => s.applicants.includes(user.id) || (!s.inviteOnly && (s.status === "open" || s.status === "forming")))
    .sort((a, b) => a.startsAt - b.startsAt)
    .map((s) => ({
      id: s.id,
      theme: { title: s.theme.title, emoji: s.theme.emoji, description: s.theme.description, tags: s.theme.tags },
      startsAt: s.startsAt,
      status: s.status,
      applicants: s.applicants.length,
      present: s.applicants.filter((id) => isPresent(s, id, now)).length,
      applied: s.applicants.includes(user.id),
      curated: Boolean(s.curated),
      capacity: s.capacity ?? null,
      roundSeconds: s.roundSeconds ?? ROUND_SECONDS(),
      canCheckIn: canCheckIn(s, now),
      missed: s.missed.includes(user.id),
      note: s.applicants.includes(user.id) ? s.note ?? null : null,
    }));
  return NextResponse.json({ now, slots, config: { min: GROUP_MIN, max: GROUP_MAX, checkinMinutes: CHECKIN_OPEN_MS / 60000, breakSeconds: BREAK_SECONDS() } });
}
