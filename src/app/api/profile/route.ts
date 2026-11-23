import { NextResponse } from "next/server";
import { z } from "zod";
import { ALL_TAGS, REGIONS } from "@/lib/questions";
import { ensureUser, viewState } from "@/lib/server";
import { mutate } from "@/lib/store";

const Body = z.object({
  nickname: z.string().trim().min(1).max(12),
  birthYear: z.number().int().min(1950).max(new Date().getFullYear() - 19),
  region: z.enum(REGIONS as [string, ...string[]]),
  bio: z.string().trim().max(300),
  tags: z.array(z.string()).max(12),
  confirmWoman: z.literal(true),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "입력값을 확인해 주세요. (만 19세 이상, 여성 확인 필수)" }, { status: 400 });
  }
  const user = await ensureUser();
  const { nickname, birthYear, region, bio } = parsed.data;
  const profile = { nickname, birthYear, region, bio, tags: parsed.data.tags.filter((t) => ALL_TAGS.includes(t)) };
  mutate((db) => {
    const u = db.users[user.id];
    u.profile = profile;
    if (u.status === "new") u.status = "profiled";
  });
  return NextResponse.json(viewState(user.id));
}
