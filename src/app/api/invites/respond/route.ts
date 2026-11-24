import { NextResponse } from "next/server";
import { z } from "zod";
import { lobbyView, respond } from "@/lib/lobby";
import { ensureUser } from "@/lib/server";

const Body = z.object({ inviteId: z.string(), accept: z.boolean() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const err = respond(user.id, parsed.data.inviteId, parsed.data.accept);
  if (err) return NextResponse.json({ error: err, ...lobbyView(user.id) }, { status: 409 });
  return NextResponse.json(lobbyView(user.id));
}
