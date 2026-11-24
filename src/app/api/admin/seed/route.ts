import { NextResponse } from "next/server";
import { seedDemo } from "@/lib/admin";
import { isAdmin } from "@/lib/server";

/** 데모 참가자를 만들고, 각자 열린 세션 1~2개에 신청시킵니다. */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const { count = 10 } = (await req.json().catch(() => ({}))) as { count?: number };
  return NextResponse.json({ ok: true, added: seedDemo(Number(count)) });
}
