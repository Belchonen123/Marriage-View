"use client";

import { createClient } from "@/lib/supabase/client";
import {
  fileLooksLikeImage,
  MAX_PROFILE_PHOTOS,
  normalizePhotoUrls,
  storagePathFromProfilePhotoUrl,
} from "@/lib/profile-photos";
import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

function isLikelyStorageObjectPath(name: string): boolean {
  return name.length > 0 && !name.includes("://") && name.includes("/");
}

type Props = {
  /** file input button style: onboarding uses rose, settings uses accent/neutral */
  variant?: "onboarding" | "settings";
  /** Fired when the photo list changes (including initial load). */
  onPhotosChange?: (urls: string[]) => void;
  /** Fired when a multi-file upload batch starts / ends. */
  onUploadingChange?: (uploading: boolean) => void;
};

export function ProfilePhotosSection({
  variant = "settings",
  onPhotosChange,
  onUploadingChange,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [urls, setUrls] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadBusyRef = useRef(false);
  const onPhotosChangeRef = useRef(onPhotosChange);
  onPhotosChangeRef.current = onPhotosChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: p, error: selErr } = await supabase
        .from("profiles")
        .select("photo_urls")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (selErr) {
        setMsg(selErr.message);
        setLoading(false);
        return;
      }
      const initial = normalizePhotoUrls(p?.photo_urls);
      setUrls(initial);
      onPhotosChangeRef.current?.(initial);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    // Copy files before any await — onChange clears the input right after this returns to the microtask queue,
    // which empties the live FileList and breaks Array.from(fileList) after getUser().
    const picked = Array.from(fileList);
    if (uploadBusyRef.current) {
      setMsg("Wait for the current upload to finish, then try again.");
      return;
    }
    uploadBusyRef.current = true;
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Sign in required");
      uploadBusyRef.current = false;
      return;
    }

    const files: File[] = [];
    for (const f of picked) {
      if (await fileLooksLikeImage(f)) files.push(f);
    }
    if (!files.length) {
      setMsg(
        "Could not read a supported image (JPEG, PNG, WebP, HEIC, etc.). Try exporting as JPG or PNG.",
      );
      uploadBusyRef.current = false;
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    setUploadProgress({ current: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        const { data: prof, error: selLoopErr } = await supabase
          .from("profiles")
          .select("photo_urls")
          .eq("id", user.id)
          .maybeSingle();
        if (selLoopErr) {
          setMsg(selLoopErr.message);
          break;
        }
        const acc = normalizePhotoUrls(prof?.photo_urls);
        const room = MAX_PROFILE_PHOTOS - acc.length;
        if (room <= 0) {
          setMsg(`You can add up to ${MAX_PROFILE_PHOTOS} photos. Remove one to add more.`);
          break;
        }

        const file = files[i];
        const baseName =
          file.name?.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_|_$/g, "") || "photo";
        const path = `${user.id}/${Date.now()}-${i}-${crypto.randomUUID().slice(0, 8)}-${baseName}`;
        const { error: upErr } = await supabase.storage.from("profile-photos").upload(path, file, {
          upsert: true,
        });
        if (upErr) {
          setMsg(upErr.message);
          break;
        }
        const { data: pub } = supabase.storage.from("profile-photos").getPublicUrl(path);
        const next = [...acc, pub.publicUrl];
        const { error } = await supabase.from("profiles").update({ photo_urls: next }).eq("id", user.id);
        if (error) {
          setMsg(error.message);
          break;
        }
        setUrls(next);
        onPhotosChangeRef.current?.(next);
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      onUploadingChange?.(false);
      uploadBusyRef.current = false;
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (uploading || urls.length >= MAX_PROFILE_PHOTOS) return;
    const dt = e.dataTransfer?.files;
    if (dt?.length) void uploadFiles(dt);
  }

  async function removePhoto(url: string) {
    setMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const path = storagePathFromProfilePhotoUrl(url);
    if (path && isLikelyStorageObjectPath(path)) {
      const { error: remErr } = await supabase.storage.from("profile-photos").remove([path]);
      if (remErr && !/not found|does not exist/i.test(remErr.message)) {
        setMsg(`Storage cleanup: ${remErr.message} — profile will still update.`);
      }
    }

    const { data: prof, error: selErr } = await supabase
      .from("profiles")
      .select("photo_urls")
      .eq("id", user.id)
      .maybeSingle();
    if (selErr) {
      setMsg(selErr.message);
      return;
    }
    const base = normalizePhotoUrls(prof?.photo_urls);
    const next = base.filter((u) => u !== url);
    const { error } = await supabase.from("profiles").update({ photo_urls: next }).eq("id", user.id);
    if (error) setMsg(error.message);
    else {
      setUrls(next);
      onPhotosChangeRef.current?.(next);
    }
  }

  if (loading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading photos…</p>;
  }

  const inputId = `profile-photos-input-${variant}`;
  const dropActiveClasses =
    variant === "onboarding"
      ? "border-rose-500/70 bg-rose-50 shadow-[0_0_0_3px_rgba(190,24,93,0.15)] dark:border-rose-400/50 dark:bg-rose-950/40"
      : "border-[var(--accent)]/60 bg-[var(--accent-muted)] shadow-[0_0_0_3px_var(--ring)]";

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Upload images</span>
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        disabled={uploading || urls.length >= MAX_PROFILE_PHOTOS}
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
        className="sr-only"
      />
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload profile photos. Drop files or activate to browse."
        aria-controls={inputId}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading && urls.length < MAX_PROFILE_PHOTOS) fileInputRef.current?.click();
          }
        }}
        onClick={() => {
          if (!uploading && urls.length < MAX_PROFILE_PHOTOS) fileInputRef.current?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!uploading && urls.length < MAX_PROFILE_PHOTOS) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          const next = e.relatedTarget as Node | null;
          if (!next || !e.currentTarget.contains(next)) setDragOver(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading && urls.length < MAX_PROFILE_PHOTOS) e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-[var(--radius-lg)] border-2 border-dashed px-4 py-8 text-center transition-[border-color,box-shadow,background-color] duration-200 ${
          dragOver
            ? dropActiveClasses
            : "border-zinc-300/90 bg-zinc-50/50 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/40 dark:hover:border-zinc-500"
        } ${uploading || urls.length >= MAX_PROFILE_PHOTOS ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Drop photos here</p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">or click to browse · JPG, PNG, WebP, HEIC…</p>
        <p className="mt-3">
          <span
            className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold text-white shadow-md ${
              variant === "onboarding"
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
            }`}
          >
            Choose files
          </span>
        </p>
      </div>
      {uploading && uploadProgress ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Uploading {uploadProgress.current} / {uploadProgress.total}…
        </p>
      ) : uploading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Uploading…</p>
      ) : null}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {urls.length} / {MAX_PROFILE_PHOTOS} photos · select several files at once
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {urls.map((u) => (
          <motion.div
            layout
            key={u}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="relative aspect-square overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800"
          >
            <Image src={u} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => void removePhoto(u)}
              disabled={uploading}
              className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition hover:bg-black/70 disabled:opacity-50"
              aria-label="Remove photo"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </motion.div>
        ))}
      </div>
      {msg ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{msg}</p> : null}
    </div>
  );
}
