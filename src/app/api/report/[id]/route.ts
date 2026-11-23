import { NextResponse } from "next/server";
import { reportView } from "@/lib/notes";
import { ensureUser, publicMember, syncAllGroups } from "@/lib/server";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 로테이션 리포트: 받은 쪽지(익명), 내가 보낸 쪽지, 내 메모 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await ensureUser();
  syncAllGroups();
  const view = reportView(user.id, id, (uid) => publicMember(readDb().users[uid]));
  if (!view) return NextResponse.json({ error: "리포트를 찾을 수 없어요." }, { status: 404 });
  return NextResponse.json(view);
}
