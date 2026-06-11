"use client";

import { ProfilePhotosSection } from "@/components/ProfilePhotosSection";
import { useToast } from "@/components/ToastProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export default function OnboardingPhotosPage() {
  const router = useRouter();
  const { show } = useToast();
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onPhotosChange = useCallback((urls: string[]) => setPhotoUrls(urls), []);

  async function finish() {
    setMsg(null);
    setFinishing(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const errMsg =
          data.error ??
          "We couldn't finish onboarding. Please try again, or WhatsApp Ben at (646) 504-4236.";
        setMsg(errMsg);
        show(errMsg, "error");
        return;
      }
      // router.replace so a back tap doesn't bounce them back to photos.
      router.replace("/onboarding/reveal");
    } finally {
      setFinishing(false);
    }
  }

  const ready = photoUrls.length > 0 && !uploadingPhotos && !finishing;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-32">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Photos
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Add at least one photo to finish onboarding. You can manage photos anytime in Settings.
        </p>
      </div>

      <div className="card-surface motion-card border border-zinc-200/80 p-5 dark:border-zinc-800/80">
        <ProfilePhotosSection
          variant="onboarding"
          onPhotosChange={onPhotosChange}
          onUploadingChange={setUploadingPhotos}
        />
      </div>

      {msg ? (
        <div
          className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-100"
          role="alert"
        >
          {msg}
        </div>
      ) : null}

      <Link
        href="/onboarding/quiz"
        className="inline-block text-sm text-[var(--accent)] underline-offset-4 hover:underline"
      >
        ← Back to questionnaire
      </Link>

      {/* Sticky bottom action bar — always visible so users can't miss it. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-[var(--background)]/95 px-4 py-3 backdrop-blur-lg dark:border-zinc-800/80 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {uploadingPhotos ? (
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Uploading…</p>
          ) : photoUrls.length === 0 ? (
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              Add at least one photo above to continue.
            </p>
          ) : (
            <p className="text-center text-xs text-emerald-700 dark:text-emerald-400">
              ✓ Photos uploaded. Tap below to start matching.
            </p>
          )}
          <button
            type="button"
            onClick={() => void finish()}
            disabled={!ready}
            className="motion-tap min-h-12 w-full rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[var(--accent-hover)] disabled:pointer-events-none disabled:opacity-50"
          >
            {finishing ? "Finishing…" : "Continue to Discover"}
          </button>
        </div>
      </div>
    </div>
  );
}
