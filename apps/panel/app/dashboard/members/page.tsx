import { membersService } from "@/lib/services/members-service";
import { MembersClient } from "./members-client";
import { sessionService } from "@/lib/services/session-service";
import { updateTag } from "next/cache";
import { ORG_ROLES } from "@workspace/shared";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string; page?: string }>;
}) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);

  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";
  const tag = `org:${activeOrgId}:members`;

  const result = await membersService.getMembers(
    {
      query: query || undefined,
      page,
      limit: PAGE_LIMIT,
      role: ORG_ROLES.MEMBER,
      includeLatestSubscription: true,
    },
    { next: { revalidate: 60, tags: [tag] } },
  );

  const refreshMembers = async () => {
    "use server";
    updateTag(tag);
  };

  void refreshMembers;

  return (
    <MembersClient
      initialMembers={result.data}
      initialPage={result.page}
      initialTotalPages={result.totalPages}
      initialQuery={query}
      limit={PAGE_LIMIT}
    />
  );
}
