import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server";
import { resetDb } from "@/lib/store";

export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  resetDb();
  return NextResponse.json({ ok: true });
}
