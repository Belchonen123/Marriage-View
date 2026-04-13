import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, PublicProfile } from "@/lib/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public-profile shape as shown on Discover (for “how you appear” preview). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: row, error } = await admin
    .from("profiles")
    .select("id, display_name, birth_year, city, bio, gender, photo_urls, photo_verification_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Profile not found" }, { status: 400 });
  }

  const p = row as Pick<
    ProfileRow,
    | "id"
    | "display_name"
    | "birth_year"
    | "city"
    | "bio"
    | "gender"
    | "photo_urls"
    | "photo_verification_status"
  >;

  const profile: PublicProfile = {
    id: p.id,
    display_name: p.display_name,
    birth_year: p.birth_year,
    city: p.city,
    bio: p.bio ?? "",
    gender: p.gender,
    photo_urls: Array.isArray(p.photo_urls) ? p.photo_urls : [],
    photo_verified: p.photo_verification_status === "verified",
  };

  return NextResponse.json({ profile });
}
