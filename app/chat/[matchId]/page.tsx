import { ChatRoomClient } from "@/components/ChatRoomClient";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: m } = await supabase
    .from("matches")
    .select("id, user_a, user_b")
    .eq("id", matchId)
    .maybeSingle();

  if (!m || (m.user_a !== user.id && m.user_b !== user.id)) {
    redirect("/matches");
  }

  const otherId = m.user_a === user.id ? m.user_b : m.user_a;
  const { data: other } = await supabase
    .from("profiles")
    .select("display_name, city, birth_year, bio, photo_urls, photo_verification_status")
    .eq("id", otherId)
    .maybeSingle();

  const urls = (other?.photo_urls as string[] | null) ?? [];
  const otherPreview = {
    city: (other?.city as string | null) ?? null,
    birthYear: (other?.birth_year as number | null) ?? null,
    bio: (other?.bio as string | null)?.trim() || null,
    photoUrl: urls[0] ?? null,
    photoVerified: other?.photo_verification_status === "verified",
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/matches" className="text-sm text-rose-800 hover:underline dark:text-rose-200">
        ← Matches
      </Link>
      <Suspense fallback={null}>
        <ChatRoomClient
          matchId={matchId}
          selfId={user.id}
          otherUserId={otherId as string}
          otherName={(other?.display_name as string | undefined)?.trim() || "Match"}
          otherPreview={otherPreview}
        />
      </Suspense>
    </div>
  );
}
