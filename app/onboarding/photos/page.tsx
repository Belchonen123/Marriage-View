"use client";

import { ProfilePhotosSection } from "@/components/ProfilePhotosSection";
import Link from "next/link";
import { useCallback, useState } from "react";

export default function OnboardingPhotosPage() {
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const onPhotosChange = useCallback((urls: string[]) => setPhotoUrls(urls), []);

  async function finish() {
    setMsg(null);
    const res = await fetch("/api/onboarding/complete", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Could not finish onboarding");
      return;
    }
    window.location.href = "/onboarding/reveal";
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Photos</h1>
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
        {msg ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
        <button
          type="button"
          onClick={() => void finish()}
          disabled={uploadingPhotos || photoUrls.length === 0}
          className="motion-tap mt-5 w-full rounded-full bg-rose-700 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-rose-800 hover:shadow-lg disabled:pointer-events-none disabled:opacity-50"
        >
          Finish onboarding
        </button>
      </div>
      <Link href="/onboarding/quiz" className="text-sm text-rose-800 hover:underline dark:text-rose-200">
        ← Questionnaire
      </Link>
    </div>
  );
}
