import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkVerify, normalizePhone, twilioConfigured } from "@/lib/twilio";
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
  const body = (await req.json().catch(() => null)) as { phone?: string; code?: string } | null;
  if (!body?.phone || !body?.code) {
    return NextResponse.json({ error: "phone and code required" }, { status: 400 });
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
  const result = await checkVerify(normalized, body.code.trim());
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (!result.approved) {
    return NextResponse.json(
      { error: "Code didn't match. Try again or request a new one." },
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
    .update({
      phone_number: normalized,
      phone_verified_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, phone: normalized });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const { error } = await admin
    .from("profiles")
    .update({ phone_number: null, phone_verified_at: null })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
