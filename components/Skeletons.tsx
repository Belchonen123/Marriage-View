/** Shared loading placeholders for route-level and inline suspense. */

export function MatchesListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="card-surface flex gap-3 border border-zinc-200/80 px-4 py-3 dark:border-zinc-700/80"
        >
          <div className="skeleton-shimmer h-14 w-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5 py-0.5">
            <div className="skeleton-shimmer h-4 w-36 rounded-md" />
            <div className="skeleton-shimmer h-3 w-full max-w-md rounded-md" />
          </div>
          <div className="skeleton-shimmer mt-2 h-4 w-4 shrink-0 rounded" />
        </li>
      ))}
    </ul>
  );
}

export function ChatThreadSkeleton() {
  return (
    <div
      className="flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-zinc-200/90 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] dark:border-zinc-700/90 dark:shadow-[var(--shadow-card-dark)]"
      aria-hidden
    >
      <div className="flex-1 space-y-4 overflow-hidden p-4">
        <div className="flex justify-center">
          <div className="skeleton-shimmer h-6 w-24 rounded-full" />
        </div>
        <div className="flex justify-start">
          <div className="skeleton-shimmer h-16 w-[min(75%,18rem)] rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <div className="skeleton-shimmer h-14 w-[min(65%,16rem)] rounded-2xl rounded-br-md" />
        </div>
        <div className="flex justify-start">
          <div className="skeleton-shimmer h-20 w-[min(70%,17rem)] rounded-2xl rounded-bl-md" />
        </div>
      </div>
      <div className="border-t border-zinc-200/80 p-3 dark:border-zinc-800/80">
        <div className="skeleton-shimmer h-12 w-full rounded-2xl" />
      </div>
    </div>
  );
}
