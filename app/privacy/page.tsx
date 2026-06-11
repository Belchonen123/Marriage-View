import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Privacy policy</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Marriage View is built to be careful with your information. Here&apos;s what we do and what we don&apos;t.
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>We collect only what&apos;s needed to run the product: account, profile, questionnaire answers, messages, and basic usage.</li>
        <li>Video dates are handled in real time and are not recorded.</li>
        <li>We never sell your data or share it with advertisers.</li>
        <li>You can request your data or delete your account at any time — WhatsApp Ben at{" "}
          <a
            href="https://wa.me/16465044236"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            (646) 504-4236
          </a>{" "}
          and we&apos;ll handle it.
        </li>
        <li>Analytics and notifications respect your choices in Settings.</li>
      </ul>
      <Link href="/settings" className="text-sm font-medium text-[var(--accent)] hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
