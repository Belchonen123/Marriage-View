"use client";

import { usePathname } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { CallAlertsPrompt } from "@/components/CallAlertsPrompt";

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

  return (
    <>
      <AppNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
      <CallAlertsPrompt />
    </>
  );
}
