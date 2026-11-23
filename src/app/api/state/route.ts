import { NextResponse } from "next/server";
import { ensureUser, viewState } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await ensureUser();
  return NextResponse.json(viewState(user.id));
}
