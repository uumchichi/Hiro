import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";
import { processLobby } from "@/lib/lobby";
import { processDueSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureUser();
  processDueSlots();
  processLobby();
  return NextResponse.json(viewState(user.id));
}
