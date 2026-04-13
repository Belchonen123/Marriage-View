import { createClient } from "@/lib/supabase/server";
import { mergeNotificationPrefs, parseNotificationPrefs, type RetentionNotificationPrefs } from "@/lib/retention/notification-prefs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prefs: parseNotificationPrefs(profile?.notification_prefs) });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", user.id)
    .maybeSingle();

  const current = parseNotificationPrefs(profile?.notification_prefs);
  const patch: Partial<RetentionNotificationPrefs> = {};
  if (typeof body.retention_journal === "boolean") patch.retention_journal = body.retention_journal;
  if (typeof body.retention_reengage === "boolean") patch.retention_reengage = body.retention_reengage;
  if (typeof body.retention_weekly_hint === "boolean") patch.retention_weekly_hint = body.retention_weekly_hint;

  const next = mergeNotificationPrefs(current, patch);

  const { error } = await supabase.from("profiles").update({ notification_prefs: next }).eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prefs: next });
}
