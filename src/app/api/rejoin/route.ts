import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";
import { mutate } from "@/lib/store";

/** 끝난 그룹을 나와서 다시 대기할 수 있게 합니다. */
export async function POST() {
  const user = await ensureUser();
  mutate((db) => {
    const u = db.users[user.id];
    const g = u.groupId ? db.groups[u.groupId] : undefined;
    if (g && (g.status === "live" || g.status === "ready")) return;
    u.groupId = undefined;
    u.status = u.analysis ? "analyzed" : "profiled";
  });
  return NextResponse.json(viewState(user.id));
}
