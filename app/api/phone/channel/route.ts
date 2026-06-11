import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["sms", "whatsapp", "none"]);

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { channel?: string } | null;
  if (!body?.channel || !ALLOWED.has(body.channel)) {
    return NextResponse.json(
      { error: "channel must be sms, whatsapp, or none" },
      { status: 400 },
    );
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const { error } = await admin
    .from("profiles")
    .update({ preferred_alert_channel: body.channel })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, channel: body.channel });
}
