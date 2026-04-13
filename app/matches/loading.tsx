import { MatchesListSkeleton } from "@/components/Skeletons";

export default function MatchesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton-shimmer h-8 w-40 rounded-md" />
        <div className="skeleton-shimmer mt-2 h-4 w-full max-w-md rounded-md" />
      </div>
      <MatchesListSkeleton rows={7} />
    </div>
  );
}
