import { NextResponse } from "next/server";
import { z } from "zod";
import { REPORT_REASONS } from "@/lib/reports";
import { ensureUser } from "@/lib/server";
import { mutate, newId, normalizeCode } from "@/lib/store";

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
  const code = normalizeCode(parsed.data.code);
  const err = mutate((db) => {
    const target = Object.values(db.users).find((u) => u.code === code);
    if (!target) return "해당 ID의 사용자를 찾을 수 없어요.";
    if (target.id === user.id) return "나 자신은 신고할 수 없어요.";
    db.reports.push({
      id: newId("rep"),
      at: Date.now(),
      reporterId: user.id,
      targetCode: code,
      targetId: target.id,
      reason: parsed.data.reason,
      detail: parsed.data.detail.trim(),
      context: parsed.data.context,
      status: "new",
    });
    return null;
  });
  if (err) return NextResponse.json({ error: err }, { status: 404 });
  return NextResponse.json({ ok: true });
}
