import { NextResponse } from "next/server";
import { formGroups, selectThemes } from "@/lib/ai";
import { GROUP_MIN } from "@/lib/heuristics";
import { buildRotation } from "@/lib/rotation";
import { isAdmin } from "@/lib/server";
import { mutate, newId, readDb } from "@/lib/store";
import type { Group } from "@/lib/types";

export const maxDuration = 300;

const g = globalThis as unknown as { __hiroMatching?: boolean };

/** AI 테마 선정 에이전트 → AI 그룹 매칭 → 로테이션 일정 생성 */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  if (g.__hiroMatching) return NextResponse.json({ error: "이미 매칭이 진행 중이에요." }, { status: 409 });
  const waiting = Object.values(readDb().users).filter((u) => u.status === "waiting" && u.analysis);
  if (waiting.length < GROUP_MIN) {
    return NextResponse.json({ error: `대기 인원이 ${GROUP_MIN}명 이상이어야 해요. (지금 ${waiting.length}명)` }, { status: 400 });
  }
  g.__hiroMatching = true;
  try {
    const { themes, note, source: themeSource } = await selectThemes(waiting);
    const plan = await formGroups(waiting, themes);
    const run = mutate((db) => {
      const groupIds: string[] = [];
      for (const p of plan.groups) {
        // 매칭 도중 대기열을 나간 사람은 제외
        const members = p.memberIds.filter((id) => db.users[id]?.status === "waiting");
        if (members.length < GROUP_MIN) continue;
        const group: Group = {
          id: newId("g"),
          createdAt: Date.now(),
          theme: themes.find((t) => t.id === p.themeId)!,
          memberIds: members,
          reason: p.reason,
          icebreakers: p.icebreakers,
          status: "ready",
          rounds: buildRotation(members),
          roundSeconds: Number(process.env.HIRO_ROUND_SECONDS ?? 300),
          breakSeconds: Number(process.env.HIRO_BREAK_SECONDS ?? 20),
          choices: {},
          submitted: [],
        };
        db.groups[group.id] = group;
        groupIds.push(group.id);
        for (const id of members) {
          db.users[id].status = "grouped";
          db.users[id].groupId = group.id;
        }
      }
      const r = {
        id: newId("run"),
        createdAt: Date.now(),
        source: themeSource === "ai" && plan.source === "ai" ? ("ai" as const) : ("rule" as const),
        themes,
        groupIds,
        unmatched: waiting.map((u) => u.id).filter((id) => db.users[id]?.status === "waiting"),
        note,
      };
      db.matchRuns.push(r);
      return r;
    });
    return NextResponse.json({ ok: true, run });
  } finally {
    g.__hiroMatching = false;
  }
}
