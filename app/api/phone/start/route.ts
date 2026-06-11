import { createClient } from "@/lib/supabase/server";
import { normalizePhone, startVerify, twilioConfigured } from "@/lib/twilio";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (!twilioConfigured()) {
    return NextResponse.json(
      { error: "Phone verification isn't configured on the server." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => null)) as { phone?: string } | null;
  if (!body?.phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }
  let normalized: string;
  try {
    normalized = normalizePhone(body.phone);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid number" },
      { status: 400 },
    );
  }
  const result = await startVerify(normalized);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, phone: normalized });
}
