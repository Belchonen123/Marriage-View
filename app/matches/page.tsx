import { EmptyState } from "@/components/EmptyState";
import { InboundLikesSection } from "@/components/InboundLikesSection";
import { MatchesList, type MatchPreview } from "@/components/MatchesList";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function MatchesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: matches } = await supabase
    .from("matches")
    .select("id, user_a, user_b, created_at")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order("created_at", { ascending: false });

  const otherIds = (matches ?? []).map((m) =>
    m.user_a === user.id ? (m.user_b as string) : (m.user_a as string),
  );

  const { data: profiles } = otherIds.length
    ? await supabase.from("profiles").select("id, display_name, photo_urls").in("id", otherIds)
    : { data: [] as { id: string; display_name: string; photo_urls: string[] }[] };

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  const matchList = matches ?? [];
  const matchIds = matchList.map((m) => m.id as string);

  const lastByMatchId = new Map<
    string,
    { id: string; body: string; created_at: string; sender_id: string }
  >();

  if (matchIds.length > 0) {
    const { data: messageRows } = await supabase
      .from("messages")
      .select("id, body, created_at, sender_id, match_id")
      .in("match_id", matchIds)
      .order("created_at", { ascending: false });

    for (const row of messageRows ?? []) {
      const mid = row.match_id as string;
      if (!lastByMatchId.has(mid)) {
        lastByMatchId.set(mid, {
          id: row.id as string,
          body: row.body as string,
          created_at: row.created_at as string,
          sender_id: row.sender_id as string,
        });
      }
    }
  }

  const rows: { preview: MatchPreview; matchedAt: string }[] = [];

  for (const m of matchList) {
    const matchId = m.id as string;
    const oid = m.user_a === user.id ? (m.user_b as string) : (m.user_a as string);
    const p = byId.get(oid);
    const matchedAt = (m.created_at as string) ?? "";
    const last = lastByMatchId.get(matchId);

    const urls = (p?.photo_urls as string[]) ?? [];
    rows.push({
      matchedAt,
      preview: {
        matchId,
        otherId: oid,
        otherName: p?.display_name ?? "Match",
        photoUrl: urls[0] ?? null,
        lastMessage: last
          ? {
              id: last.id,
              body: last.body,
              created_at: last.created_at,
              sender_id: last.sender_id,
            }
          : null,
      },
    });
  }

  rows.sort((a, b) => {
    const ta = new Date(a.preview.lastMessage?.created_at ?? a.matchedAt).getTime();
    const tb = new Date(b.preview.lastMessage?.created_at ?? b.matchedAt).getTime();
    if (tb !== ta) return tb - ta;
    return a.preview.matchId.localeCompare(b.preview.matchId);
  });

  const previews = rows.map((r) => r.preview);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Matches
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Plan <strong className="font-medium text-zinc-800 dark:text-zinc-200">video dates</strong> with your matches. Chat
          is for light coordination — extended texting isn&apos;t recommended; open a Video Date Room when you&apos;re
          both ready.
        </p>
      </div>
      <InboundLikesSection />
      {!matches?.length ? (
        <EmptyState
          title="No matches yet"
          description="Spend a few minutes in Discover with intention. When you and someone both like each other, you’ll land here to coordinate a video date."
          icon={
            <svg className="h-7 w-7" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          }
        >
          <Link
            href="/discover"
            className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
          >
            Go to Discover
          </Link>
        </EmptyState>
      ) : (
        <MatchesList selfId={user.id} matches={previews} />
      )}
    </div>
  );
}
