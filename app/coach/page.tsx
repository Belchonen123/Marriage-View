import { CoachClient } from "@/components/CoachClient";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { match: matchParam } = await searchParams;
  const matchId =
    typeof matchParam === "string" && /^[0-9a-f-]{36}$/i.test(matchParam.trim()) ? matchParam.trim() : null;

  let matchImportContext: { matchId: string; otherName: string } | undefined;
  if (matchId) {
    const { data: m } = await supabase
      .from("matches")
      .select("user_a, user_b")
      .eq("id", matchId)
      .maybeSingle();
    if (m && (m.user_a === user.id || m.user_b === user.id)) {
      const otherId = m.user_a === user.id ? m.user_b : m.user_a;
      const { data: other } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", otherId)
        .maybeSingle();
      matchImportContext = {
        matchId,
        otherName: (other?.display_name as string | undefined)?.trim() || "Match",
      };
    }
  }

  return <CoachClient initialMatchId={matchId} matchImportContext={matchImportContext} />;
}
