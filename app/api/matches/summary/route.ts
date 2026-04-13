import { createClient } from "@/lib/supabase/server";
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

  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const threads: {
    matchId: string;
    last: { id: string; sender_id: string; body: string; created_at: string } | null;
  }[] = [];

  for (const m of matches ?? []) {
    const matchId = m.id as string;
    const { data: last } = await supabase
      .from("messages")
      .select("id, sender_id, body, created_at")
      .eq("match_id", matchId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    threads.push({ matchId, last: last ?? null });
  }

  return NextResponse.json({ selfId: user.id, threads });
}
