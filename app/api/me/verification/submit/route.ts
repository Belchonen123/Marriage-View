import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidVerificationPath(userId: string, path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/")) return false;
  const prefix = `${userId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^verification-selfie[-.a-zA-Z0-9]+$/.test(rest);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !uuidRe.test(user.id)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { objectPath?: string };
  try {
    body = (await req.json()) as { objectPath?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const objectPath = typeof body.objectPath === "string" ? body.objectPath.trim() : "";
  if (!isValidVerificationPath(user.id, objectPath)) {
    return NextResponse.json({ error: "Invalid object path" }, { status: 400 });
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
      verification_selfie_path: objectPath,
      photo_verification_status: "pending",
      photo_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
