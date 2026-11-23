import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";
import { processDueSlots } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureUser();
  processDueSlots();
  return NextResponse.json(viewState(user.id));
}
