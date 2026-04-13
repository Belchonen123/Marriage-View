import Link from "next/link";

export default function CommunityPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Community guidelines</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Marriage View is built for people seeking serious, marriage-minded relationships. Help keep it safe and kind.
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Be honest in your profile and intentions.</li>
        <li>No harassment, hate, threats, or unwanted sexual content.</li>
        <li>No scams, spam, or impersonation.</li>
        <li>Respect boundaries — if someone asks you to stop, stop.</li>
        <li>Report concerns via Settings so moderators can review.</li>
      </ul>
      <Link href="/settings" className="text-sm font-medium text-[var(--accent)] hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
