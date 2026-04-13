"use client";

import { createClient } from "@/lib/supabase/client";
import { fileLooksLikeImage } from "@/lib/profile-photos";
import { useToast } from "@/components/ToastProvider";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function PhotoVerificationSection() {
  const supabase = useMemo(() => createClient(), []);
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<string>("none");
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: p, error } = await supabase
      .from("profiles")
      .select("photo_verification_status, verification_selfie_path")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      show(error.message, "error");
      setLoading(false);
      return;
    }
    setStatus((p?.photo_verification_status as string) ?? "none");
    setSelfiePath((p?.verification_selfie_path as string) ?? null);
    setLoading(false);
  }, [supabase, show]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadSelfie(file: File) {
    if (!(await fileLooksLikeImage(file))) {
      show("Please choose a clear photo (JPG, PNG, WebP, etc.).", "error");
      return;
    }
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        show("Sign in required.", "error");
        return;
      }
      const path = `${user.id}/verification-selfie-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, {
        upsert: true,
      });
      if (upErr) {
        show(upErr.message, "error");
        return;
      }
      const res = await fetch("/api/me/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: path }),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error ?? "Submit failed", "error");
        return;
      }
      setStatus("pending");
      setSelfiePath(path);
      const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path);
      setPreviewUrl(pub.publicUrl);
      show("Submitted for review. We will verify your selfie against your profile photos.", "success");
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!selfiePath) {
      setPreviewUrl(null);
      return;
    }
    const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(selfiePath);
    setPreviewUrl(pub.publicUrl);
  }, [selfiePath, supabase]);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading verification…</p>;
  }

  const label =
    status === "verified"
      ? "Photo verified"
      : status === "pending"
        ? "Pending review"
        : status === "rejected"
          ? "Not verified — you can submit again"
          : "Not verified";

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Status:{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">{label}</span>
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Upload a current selfie (same person as your profile). A team member compares it to your photos and clears a
        verified badge on Discover — no automated liveness in this MVP.
      </p>
      {previewUrl && status !== "none" ? (
        <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
          <Image src={previewUrl} alt="Verification selfie" fill className="object-cover" unoptimized />
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void uploadSelfie(f);
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
        className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {uploading
          ? "Uploading…"
          : status === "pending"
            ? "Replace selfie (still pending)"
            : "Upload verification selfie"}
      </button>
    </div>
  );
}
