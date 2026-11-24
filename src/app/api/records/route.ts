import { NextResponse } from "next/server";
import { myRecords } from "@/lib/notes";
import { ensureUser, publicMember, syncAllGroups } from "@/lib/server";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

/** 내 기록: 지난 로테이션 리포트와 열려 있는 채팅방 */
export async function GET() {
  const user = await ensureUser();
  syncAllGroups();
  return NextResponse.json(myRecords(user.id, (uid) => publicMember(readDb().users[uid])));
}
