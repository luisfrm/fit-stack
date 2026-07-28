import { Skeleton } from "@workspace/ui/components";

export default function PaymentsLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-4 w-full">
        <Skeleton className="h-64 w-full xl:w-1/2 rounded-2xl" />
        <Skeleton className="h-64 w-full xl:w-1/2 rounded-2xl" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
