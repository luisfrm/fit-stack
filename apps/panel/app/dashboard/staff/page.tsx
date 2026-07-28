import { membersService } from "@/lib/services/members-service";
import { StaffClient } from "./staff-client";
import { updateTag } from "next/cache";
import { ORG_ROLES } from "@workspace/shared";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);

  const result = await membersService.getMembers(
    {
      query: query || undefined,
      page,
      limit: PAGE_LIMIT,
      excludeRole: ORG_ROLES.MEMBER,
    } as Parameters<typeof membersService.getMembers>[0],
    { next: { revalidate: 60, tags: ["panel:staff"] } },
  );

  const refreshStaff = async () => {
    "use server";
    updateTag("panel:staff");
  };

  void refreshStaff;

  return (
    <StaffClient
      initialStaff={result.data}
      initialPage={result.page}
      initialTotalPages={result.totalPages}
      initialQuery={query}
      limit={PAGE_LIMIT}
    />
  );
}
