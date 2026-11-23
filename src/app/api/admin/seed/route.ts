import { NextResponse } from "next/server";
import { makeDemoUser } from "@/lib/demo";
import { isAdmin } from "@/lib/server";
import { mutate } from "@/lib/store";

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const { count = 10 } = (await req.json().catch(() => ({}))) as { count?: number };
  const n = Math.min(40, Math.max(1, Number(count) || 10));
  mutate((db) => {
    const base = Object.values(db.users).filter((u) => u.isDemo).length;
    for (let i = 0; i < n; i++) {
      const u = makeDemoUser(base + i + 1);
      db.users[u.id] = u;
    }
  });
  return NextResponse.json({ ok: true, added: n });
}
