import { ChatThreadSkeleton } from "@/components/Skeletons";

export default function ChatLoading() {
  return (
    <div className="space-y-5">
      <div className="card-surface flex flex-col gap-4 border border-zinc-200/80 p-4 dark:border-zinc-700/80">
        <div className="skeleton-shimmer h-6 w-24 rounded-md" />
        <div className="skeleton-shimmer h-8 w-48 rounded-md" />
      </div>
      <ChatThreadSkeleton />
    </div>
  );
}
