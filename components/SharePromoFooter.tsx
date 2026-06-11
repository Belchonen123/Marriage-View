"use client";

import { BrandCard } from "@/components/BrandCard";
import { ShareButton } from "@/components/ShareButton";

const BUILDER_WHATSAPP_URL =
  "https://wa.me/16465044236?text=" +
  encodeURIComponent("Hi Ben — saw Marriage View. ");
const BUILDER_PHONE_DISPLAY = "(646) 504-4236";

/**
 * Bottom-of-page promo strip: WhatsApp share button + feedback/AI-build CTA +
 * Built-with-AI maker's mark. Mounted globally via Shell on every signed-in
 * page (excluding the bare routes and the in-call/onboarding/admin surfaces).
 */
export function SharePromoFooter() {
  return (
    <footer className="mt-10 space-y-6 border-t border-zinc-200/70 pt-8 dark:border-zinc-800/70">
      <div className="flex flex-col items-center gap-2 text-center">
        <ShareButton placement="waiting_room" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Know someone marriage-minded? Share Marriage View.
        </p>
      </div>

      <div className="mx-auto max-w-md rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          Feedback, comments, or need AI / software built for your business?
        </p>
        <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
          WhatsApp me today — happy to talk.
        </p>
        <a
          href={BUILDER_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M19.05 4.91A10 10 0 0 0 4.1 18.17L2 22l3.95-1.04A10 10 0 1 0 19.05 4.9zM12 20.07a8.07 8.07 0 0 1-4.11-1.12l-.3-.18-2.34.62.63-2.28-.2-.31a8.07 8.07 0 1 1 6.32 3.27zm4.42-6.05c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.55.12-.16.24-.63.78-.77.94-.14.16-.28.18-.52.06a6.6 6.6 0 0 1-1.94-1.2 7.3 7.3 0 0 1-1.35-1.68c-.14-.24 0-.36.1-.48.1-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.32-.75-1.8-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.5.58.18 1.1.16 1.51.1.46-.07 1.43-.59 1.63-1.15.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28z" />
          </svg>
          WhatsApp Ben — {BUILDER_PHONE_DISPLAY}
        </a>
      </div>

      <BrandCard variant="compact" placement="waiting_room" />
    </footer>
  );
}

export default SharePromoFooter;
