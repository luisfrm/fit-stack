import { Skeleton, Text } from "@workspace/ui/components";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    </div>
  );
}
