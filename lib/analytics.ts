"use client";

import posthog from "posthog-js";

let initialized = false;

function envKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

function envHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
}

export function initAnalytics(): void {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const key = envKey();
  if (!key) return;
  posthog.init(key, {
    api_host: envHost(),
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
    autocapture: false,
  });
  initialized = true;
}

export function track(
  event: string,
  props?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!envKey()) return;
  try {
    posthog.capture(event, props);
  } catch {
    /* ignore */
  }
}
