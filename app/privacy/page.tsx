import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Privacy policy</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This is a <strong>prototype</strong> privacy stub. Replace with a real policy and your data subprocessors (e.g.
        Supabase, LiveKit, email provider) before production.
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>We process account, profile, questionnaire, messaging, and usage data to run the product.</li>
        <li>Video calls may be handled by a third-party WebRTC provider under their terms.</li>
        <li>You can request account deletion subject to legal retention needs (stub — define your process).</li>
        <li>Analytics or marketing email require separate consent where required by law.</li>
      </ul>
      <Link href="/settings" className="text-sm font-medium text-[var(--accent)] hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
