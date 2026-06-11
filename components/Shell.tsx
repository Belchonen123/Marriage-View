"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CallAlertsPrompt } from "@/components/CallAlertsPrompt";
import { SharePromoFooter } from "@/components/SharePromoFooter";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare =
    pathname === "/login" ||
    pathname?.startsWith("/auth") ||
    pathname === "/" ||
    pathname?.startsWith("/admin");

  if (bare) {
    return <>{children}</>;
  }

  // Promo footer (share + maker's mark) is dignified on most surfaces but
  // would intrude on onboarding flow and active 1:1 chat.
  const hidePromoFooter =
    pathname?.startsWith("/onboarding") || pathname?.startsWith("/chat");

  return (
    <>
      <AppNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
        {hidePromoFooter ? null : <SharePromoFooter />}
      </main>
      <CallAlertsPrompt />
    </>
  );
}
