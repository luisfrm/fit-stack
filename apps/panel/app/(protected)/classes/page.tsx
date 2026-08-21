import { classesService } from "@/lib/services/classes-service";
import { ClassesClient } from "./classes-client";
import { sessionService } from "@/lib/services/session-service";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function ClassesPage({
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

  // Fetch session to determine active org ID for isolated cache tagging
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";
  const tag = `org:${activeOrgId}:classes`;

  const filters: {
    name?: string;
    isVisible?: boolean;
    page: number;
    limit: number;
  } = {
    page,
    limit: PAGE_LIMIT,
  };
  if (query) filters.name = query;
  if (initialVisibility === "visible") filters.isVisible = true;
  if (initialVisibility === "hidden") filters.isVisible = false;

  const result = await classesService.getClasses(filters, {
    next: { revalidate: 60, tags: [tag] },
  });

  // Server Action to purge organization-specific classes cache tag
  const refreshClasses = async () => {
    "use server";
    updateTag(tag);
  };

  return (
    <ClassesClient
      initialClasses={result}
      initialQuery={query}
      initialVisibility={initialVisibility}
      limit={PAGE_LIMIT}
      onSuccess={refreshClasses}
    />
  );
}
