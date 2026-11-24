import { NextResponse } from "next/server";
import { adminOverview } from "@/lib/admin";
import { processLobby } from "@/lib/lobby";
import { isAdmin } from "@/lib/server";
import { processDueSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "운영자 키가 필요해요." }, { status: 401 });
  const now = Date.now();
  processDueSlots(now);
  processLobby(now);
  return NextResponse.json(adminOverview(now));
}
