import { NextResponse } from "next/server";
import { z } from "zod";
import { grantByCode } from "@/lib/admin";
import { isAdmin } from "@/lib/server";

const Body = z.object({
  code: z.string().min(4).max(8),
  item: z.enum(["doki", "ticket", "badge"]),
  amount: z.number().int().min(1).max(10000),
  note: z.string().max(100).default("운영자 지급"),
});

/** 운영자 지급: 공개 ID로 도키·입장권·직진러의 증표를 줘요 (결제 연결 전 테스트·이벤트용). */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해 주세요." }, { status: 400 });
  const out = grantByCode(parsed.data.code, parsed.data.item, parsed.data.amount, parsed.data.note);
  if (out.error) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, note: out.note });
}
