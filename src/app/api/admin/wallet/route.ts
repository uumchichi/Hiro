import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/server";
import { normalizeCode, readDb } from "@/lib/store";
import { grant } from "@/lib/wallet";

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
  const code = normalizeCode(parsed.data.code);
  const user = Object.values(readDb().users).find((u) => u.code === code);
  if (!user) return NextResponse.json({ error: "해당 ID의 사용자를 찾을 수 없어요." }, { status: 404 });
  if (user.isDemo) return NextResponse.json({ error: "데모 참가자에게는 지급할 수 없어요." }, { status: 400 });
  grant(user.id, parsed.data.item, parsed.data.amount, parsed.data.note || "운영자 지급");
  const name = { doki: "도키", ticket: "입장권", badge: "직진러의 증표" }[parsed.data.item];
  return NextResponse.json({ ok: true, note: `${user.profile?.nickname ?? "사용자"} #${code}에게 ${name} ${parsed.data.amount}개를 지급했어요.` });
}
