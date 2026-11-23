import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";
import { mutate } from "@/lib/store";

export async function POST(req: Request) {
  const { join } = (await req.json().catch(() => ({}))) as { join?: boolean };
  const user = await ensureUser();
  if (!user.analysis) return NextResponse.json({ error: "성향 검사를 먼저 해 주세요." }, { status: 400 });
  if (user.status === "grouped") return NextResponse.json({ error: "이미 그룹에 배정됐어요." }, { status: 400 });
  mutate((db) => {
    db.users[user.id].status = join ? "waiting" : "analyzed";
  });
  return NextResponse.json(viewState(user.id));
}
