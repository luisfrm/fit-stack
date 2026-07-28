import { trainersService } from "@/lib/services/trainers-service";
import { TrainersClient } from "./trainers-client";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string;
    page?: string;
    isVisible?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);
  const isVisibleParam = params.isVisible;
  const initialVisibility: "all" | "visible" | "hidden" =
    isVisibleParam === "true"
      ? "visible"
      : isVisibleParam === "false"
        ? "hidden"
        : "all";

  const filters: {
    page: number;
    limit: number;
    name?: string;
    isVisible?: boolean;
  } = {
    page,
    limit: PAGE_LIMIT,
  };
  if (query) filters.name = query;
  if (initialVisibility === "visible") filters.isVisible = true;
  if (initialVisibility === "hidden") filters.isVisible = false;

  const result = await trainersService.getTrainers(filters, {
    next: { revalidate: 60, tags: ["panel:trainers"] },
  });

  const refreshTrainers = async () => {
    "use server";
    updateTag("panel:trainers");
  };

  void refreshTrainers;

  return (
    <TrainersClient
      initialTrainers={result.data}
      initialPage={result.page}
      initialTotalPages={result.totalPages}
      initialTotal={result.total}
      initialQuery={query}
      initialVisibility={initialVisibility}
      limit={PAGE_LIMIT}
    />
  );
}
