import { createClient } from "@/lib/supabase/server";
import { LikesWallClient } from "@/components/LikesWallClient";
import { redirect } from "next/navigation";

export default async function LikesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Likes
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          People who liked you before you matched. Plus shows the full list; everyone else sees a count and silhouettes
          when the feature is enabled.
        </p>
      </div>
      <LikesWallClient />
    </div>
  );
}
