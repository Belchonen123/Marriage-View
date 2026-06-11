"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics";
import { reconcilePushSubscription } from "@/lib/push-reconcile";

export function AnalyticsProvider() {
  useEffect(() => {
    initAnalytics();
    // Self-heal push subscriptions silently — handles VAPID rotation, stale
    // subscriptions, and previously-granted-but-not-saved permissions.
    void reconcilePushSubscription().catch(() => {});
  }, []);
  return null;
}

export default AnalyticsProvider;
