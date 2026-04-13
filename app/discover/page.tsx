import { createClient } from "@/lib/supabase/server";
import { DailyPromptDiscoverBanner } from "@/components/DailyPromptDiscoverBanner";
import { DiscoverSkeleton, DiscoverStack } from "@/components/DiscoverStack";
import { PremiumFiltersBadge } from "@/components/PremiumFiltersBadge";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-8">
      <div className="text-center sm:text-left">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Discover
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Best compatibility first. Pass or like — mutual likes lead to light chat and real{" "}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">video dates</strong> on Marriage View.
        </p>
        <div className="mt-3">
          <PremiumFiltersBadge />
        </div>
        <div className="mt-4">
          <DailyPromptDiscoverBanner />
        </div>
      </div>
      <Suspense fallback={<DiscoverSkeleton />}>
        <DiscoverStack />
      </Suspense>
    </div>
  );
}
