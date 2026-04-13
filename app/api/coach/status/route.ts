import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Whether the coach can run on the server (no secrets exposed). */
export async function GET() {
  const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
  return NextResponse.json({ configured });
}
