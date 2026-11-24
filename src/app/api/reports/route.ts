import { NextResponse } from "next/server";
import { z } from "zod";
import { REPORT_REASONS, reportUser } from "@/lib/reports-server";
import { ensureUser } from "@/lib/server";

const Body = z.object({
  code: z.string().min(4).max(8),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().max(1000).default(""),
  context: z.string().max(100).default(""),
});

/** 공개 ID로 사용자를 신고합니다. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "신고 내용을 확인해 주세요." }, { status: 400 });
  const user = await ensureUser();
  const err = reportUser(user.id, parsed.data.code, parsed.data.reason, parsed.data.detail, parsed.data.context);
  if (err) return NextResponse.json({ error: err }, { status: 404 });
  return NextResponse.json({ ok: true });
}
