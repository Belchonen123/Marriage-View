import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <h1 className="font-display text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Terms of use</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        This is a <strong>prototype</strong> legal stub. Replace with counsel-reviewed terms before production.
      </p>
      <ul className="list-inside list-disc space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
        <li>You agree to use Marriage View respectfully and lawfully.</li>
        <li>You are responsible for content you send, including messages and calls.</li>
        <li>
          In-app tips that encourage video dates (for example after several messages) are{" "}
          <strong>automated heuristics</strong>, not a human or generative-AI review of your conversation.
        </li>
        <li>We may suspend accounts that violate community guidelines or applicable law.</li>
        <li>The service is provided as-is without warranties; liability is limited to the extent permitted by law.</li>
      </ul>
      <Link href="/settings" className="text-sm font-medium text-[var(--accent)] hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
