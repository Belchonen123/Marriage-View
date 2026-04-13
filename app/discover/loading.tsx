import { DiscoverSkeleton } from "@/components/DiscoverStack";

export default function DiscoverLoading() {
  return (
    <div className="space-y-8">
      <div className="text-center sm:text-left">
        <div className="skeleton-shimmer mx-auto h-9 w-48 rounded-md sm:mx-0" />
        <div className="skeleton-shimmer mx-auto mt-3 h-4 w-full max-w-xl rounded-md sm:mx-0" />
      </div>
      <DiscoverSkeleton />
    </div>
  );
}
