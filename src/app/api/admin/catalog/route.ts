import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server";
import { refreshCatalog } from "@/lib/slots";

export const maxDuration = 300;

/** AI 테마 에이전트로 테마 목록을 새로 만듭니다. */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const out = await refreshCatalog();
  return NextResponse.json({ ok: true, ...out });
}
