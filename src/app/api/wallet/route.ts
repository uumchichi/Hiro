import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureUser } from "@/lib/server";
import { exchange, walletView } from "@/lib/wallet";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureUser();
  if (user.isDemo) return NextResponse.json({ error: "지갑을 쓸 수 없어요." }, { status: 400 });
  return NextResponse.json(walletView(user.id));
}

const Body = z.object({ action: z.literal("exchange"), item: z.enum(["ticket", "badge"]), count: z.number().int().min(1).max(20) });

/** 도키를 입장권·직진러의 증표로 바꾸기 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const err = exchange(user.id, parsed.data.item, parsed.data.count);
  if (err) return NextResponse.json({ error: err, ...walletView(user.id) }, { status: 409 });
  return NextResponse.json(walletView(user.id));
}
