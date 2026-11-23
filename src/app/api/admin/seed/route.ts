import { NextResponse } from "next/server";
import { makeDemoUser } from "@/lib/demo";
import { isAdmin } from "@/lib/server";
import { ensureSlots } from "@/lib/slots";
import { mutate } from "@/lib/store";

/** 데모 참가자를 만들고, 각자 열린 세션 1~2개에 신청시킵니다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const { count = 10 } = (await req.json().catch(() => ({}))) as { count?: number };
  const n = Math.min(40, Math.max(1, Number(count) || 10));
  ensureSlots();
  mutate((db) => {
    const base = Object.values(db.users).filter((u) => u.isDemo).length;
    const open = Object.values(db.slots).filter((s) => s.status === "open");
    for (let i = 0; i < n; i++) {
      const u = makeDemoUser(base + i + 1);
      db.users[u.id] = u;
      const picks = [...open].sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2));
      for (const s of picks) s.applicants.push(u.id);
    }
  });
  return NextResponse.json({ ok: true, added: n });
}
