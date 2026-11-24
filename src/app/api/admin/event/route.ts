import { NextResponse } from "next/server";
import { z } from "zod";
import { ALL_TAGS } from "@/lib/questions";
import { isAdmin } from "@/lib/server";
import { cancelEvent, createCuratedEvent } from "@/lib/slots";

const Create = z.object({
  action: z.literal("create"),
  title: z.string().trim().min(2).max(40),
  emoji: z.string().trim().max(8).default("✨"),
  description: z.string().trim().max(120).default(""),
  tags: z.array(z.string()).max(6).default([]),
  icebreakers: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
  startsAt: z.number().int(), // 운영자 브라우저 기준 시각을 ms로 보내요
  roundMinutes: z.number().min(0.5).max(30),
  capacity: z.number().int().min(4).max(60),
});
const Cancel = z.object({ action: z.literal("cancel"), slotId: z.string() });

/** 운영진 기획 이벤트 만들기 / 취소 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const cancel = Cancel.safeParse(body);
  if (cancel.success) {
    const err = cancelEvent(cancel.data.slotId);
    if (err) return NextResponse.json({ error: err }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const parsed = Create.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해 주세요. (테마 이름 2자 이상, 정원 4~60명)" }, { status: 400 });
  const d = parsed.data;
  if (d.startsAt < Date.now() + 60_000) return NextResponse.json({ error: "시작 시간은 지금보다 뒤여야 해요." }, { status: 400 });
  const slot = createCuratedEvent({
    title: d.title,
    emoji: d.emoji,
    description: d.description,
    tags: d.tags.filter((t) => ALL_TAGS.includes(t)),
    icebreakers: d.icebreakers,
    startsAt: d.startsAt,
    roundSeconds: Math.round(d.roundMinutes * 60),
    capacity: d.capacity,
  });
  return NextResponse.json({ ok: true, slotId: slot.id });
}
