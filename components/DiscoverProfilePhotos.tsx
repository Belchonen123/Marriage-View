"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function DiscoverProfilePhotos({
  urls,
  profileId,
  sizes,
}: {
  urls: string[];
  profileId: string;
  sizes: string;
}) {
  const photos = urls.filter(Boolean);
  const [i, setI] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);

  const n = photos.length;
  const current = photos[Math.min(i, Math.max(0, n - 1))] ?? null;

  useEffect(() => {
    setImgLoaded(false);
  }, [current]);

  if (!current) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        No photo
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute inset-0 z-0 bg-zinc-200 transition-opacity duration-300 dark:bg-zinc-700 ${
          imgLoaded ? "opacity-0" : "opacity-100"
        }`}
        aria-hidden
      />
      <Image
        key={current}
        src={current}
        alt=""
        fill
        className={`z-[1] object-cover transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
        sizes={sizes}
        unoptimized
        onLoadingComplete={() => setImgLoaded(true)}
      />
      {n > 1 ? (
        <>
          <button
            type="button"
            className="absolute inset-y-0 left-0 z-[3] w-[28%] max-w-[7rem] cursor-pointer touch-manipulation bg-gradient-to-r from-black/20 to-transparent opacity-30 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none sm:opacity-0 sm:hover:opacity-100"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation();
              setI((x) => (x - 1 + n) % n);
            }}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-[3] w-[28%] max-w-[7rem] cursor-pointer touch-manipulation bg-gradient-to-l from-black/20 to-transparent opacity-30 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none sm:opacity-0 sm:hover:opacity-100"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation();
              setI((x) => (x + 1) % n);
            }}
          />
          <div
            className="pointer-events-none absolute bottom-[4.5rem] left-0 right-0 z-[3] flex justify-center gap-1.5 px-4"
            aria-hidden
          >
            {photos.map((_, d) => (
              <span
                key={`${profileId}-dot-${d}`}
                className={`h-1.5 rounded-full transition-all ${
                  d === i ? "w-6 bg-white shadow-sm" : "w-1.5 bg-white/45"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
