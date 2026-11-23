import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser, syncGroupStatus, viewState } from "@/lib/server";
import { mutate, readDb } from "@/lib/store";

const Body = z.object({ ids: z.array(z.string()).max(10) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const group = user.groupId ? readDb().groups[user.groupId] : undefined;
  if (!group) return NextResponse.json({ error: "참여 중인 그룹이 없어요." }, { status: 400 });
  syncGroupStatus(group);
  if (group.status !== "choosing") return NextResponse.json({ error: "아직 선택 시간이 아니에요." }, { status: 409 });
  mutate((db) => {
    const g = db.groups[group.id];
    g.choices[user.id] = parsed.data.ids.filter((id) => id !== user.id && g.memberIds.includes(id));
    if (!g.submitted.includes(user.id)) g.submitted.push(user.id);
    if (g.submitted.length === g.memberIds.length) g.status = "done";
  });
  return NextResponse.json(viewState(user.id));
}
