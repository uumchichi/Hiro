import { NextResponse } from "next/server";
import { z } from "zod";
import { LETTER_MAX, MEMO_MAX, saveNote } from "@/lib/notes";
import { ensureUser } from "@/lib/server";

const Body = z.object({
  groupId: z.string(),
  to: z.string(),
  letter: z.string().max(LETTER_MAX * 2).optional(),
  memo: z.string().max(MEMO_MAX * 2).optional(),
});

/** 쪽지(상대에게, 끝난 뒤 익명 전달)와 메모(나만 보기) 저장 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  const user = await ensureUser();
  const { groupId, to, letter, memo } = parsed.data;
  const err = saveNote(user.id, groupId, to, { letter, memo });
  if (err) return NextResponse.json({ error: err }, { status: 409 });
  return NextResponse.json({ ok: true });
}
