"use client";

import { useFeatureFlags } from "@/components/FeatureFlagsProvider";

export function PremiumFiltersBadge() {
  const flags = useFeatureFlags();
  if (!flags.premium_filters) {
    return null;
  }
  return (
    <p className="text-center text-xs font-medium text-amber-900 dark:text-amber-100/90">
      Premium discover flag is on — reserved for upcoming filter and ranking experiments.
    </p>
  );
}
