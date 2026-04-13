import { isAdminRelaxedAuth } from "@/lib/admin-config";
import Link from "next/link";

const nav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/questions", label: "Questionnaire" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/flags", label: "Feature flags" },
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const relaxed = isAdminRelaxedAuth();

  return (
    <div className="flex min-h-full flex-col">
      {relaxed ? (
        <div
          role="status"
          className="border-b border-amber-200/90 bg-amber-50 px-4 py-2.5 text-center text-xs text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100 sm:text-sm"
        >
          <strong className="font-semibold">Open admin access:</strong>{" "}
          NODE_ENV is development — any signed-in user may use this panel.{" "}
          <span className="block sm:inline">
            For production, deploy with NODE_ENV=production and set ADMIN_EMAILS and/or ADMIN_USER_IDS; ADMIN_RELAXED_AUTH
            does not grant access in production.
          </span>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="border-b border-zinc-200 bg-white/90 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950 md:w-52 md:shrink-0 md:border-b-0 md:border-r">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-800 dark:text-rose-300">Admin</p>
          <nav className="mt-4 flex flex-wrap gap-2 md:flex-col md:gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-rose-50 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/discover"
            className="mt-6 block text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
          >
            ← Back to app
          </Link>
        </aside>
        <div className="flex-1 px-4 py-6 md:px-8">{children}</div>
      </div>
    </div>
  );
}
