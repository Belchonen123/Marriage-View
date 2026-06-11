"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

const DEFAULT_EMAIL = "belchonen18@gmail.com";
const DEFAULT_PHONE = "+16465044236";
const DEFAULT_PHONE_DISPLAY = "(646) 504-4236";
const DEFAULT_WHATSAPP =
  "https://wa.me/16465044236?text=" +
  encodeURIComponent("Hi Ben — saw Marriage View. ");

type Placement = "landing_footer" | "post_date" | "waiting_room";

type BrandCardProps = {
  variant: "full" | "compact";
  placement: Placement;
  appName?: string;
  showCommunityLine?: boolean;
};

function consultHref(): string {
  const env = process.env.NEXT_PUBLIC_CONSULT_URL;
  if (env && env.length > 0) return env;
  return `mailto:${DEFAULT_EMAIL}?subject=AI%20consultation`;
}

export function BrandCard({
  variant,
  placement,
  appName = "Marriage View",
  showCommunityLine = false,
}: BrandCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const seen = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (seen.current) return;
    const fire = () => {
      if (seen.current) return;
      seen.current = true;
      track("brand_card_viewed", { variant, placement, app: appName });
    };
    if (typeof IntersectionObserver === "undefined") {
      fire();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            fire();
            io.disconnect();
            return;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [variant, placement, appName]);

  const onClick = () => {
    track("brand_card_clicked", { variant, placement, app: appName });
  };

  const href = consultHref();

  if (variant === "compact") {
    return (
      <div ref={ref} className="mt-6 flex w-full justify-center px-4 text-center">
        <a
          href={href}
          onClick={onClick}
          className="text-xs leading-relaxed text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
        >
          Built and run with AI by Ben Elchonen — see what AI can build for your business →
        </a>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="mt-8 flex w-full flex-col items-center gap-3 border-t border-zinc-200/70 px-4 py-6 text-center dark:border-zinc-800/70"
    >
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Built with AI by Ben Elchonen — Actualizer.
      </p>
      <p className="max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
        We build and configure AI systems for businesses in healthcare, legal, and operations.
      </p>
      {showCommunityLine ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Free for the community, always.
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <a
          href={DEFAULT_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          WhatsApp Ben
        </a>
        <a
          href={href}
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
        >
          Email →
        </a>
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        <a
          href={`tel:${DEFAULT_PHONE}`}
          onClick={onClick}
          className="underline-offset-4 hover:underline"
        >
          {DEFAULT_PHONE_DISPLAY}
        </a>
        <span aria-hidden> · </span>
        <a
          href={`mailto:${DEFAULT_EMAIL}`}
          onClick={onClick}
          className="underline-offset-4 hover:underline"
        >
          {DEFAULT_EMAIL}
        </a>
      </p>
    </div>
  );
}

export default BrandCard;
