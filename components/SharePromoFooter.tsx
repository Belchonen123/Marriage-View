"use client";

import { BrandCard } from "@/components/BrandCard";
import { ShareButton } from "@/components/ShareButton";

/**
 * Bottom-of-page promo strip: WhatsApp share button + Built-with-AI maker's mark.
 * Mounted globally via Shell on every signed-in page (excluding the bare routes
 * and the in-call/onboarding/admin surfaces).
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
      <BrandCard variant="compact" placement="waiting_room" />
    </footer>
  );
}

export default SharePromoFooter;
