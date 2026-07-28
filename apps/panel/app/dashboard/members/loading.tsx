import { Skeleton } from "@workspace/ui/components";

export default function MembersLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <Skeleton className="h-10 w-full max-w-md rounded-xl" />

      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
