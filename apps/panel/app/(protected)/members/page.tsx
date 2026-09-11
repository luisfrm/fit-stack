import { membersService } from "@/lib/services/members-service";
import { MembersClient } from "./members-client";
import { sessionService } from "@/lib/services/session-service";
import { getOrgFeatures, getOrgSeats } from "@/lib/services/org-features";
import { PortalSeatsBanner } from "@/components/dashboard/portal-seats-banner";
import { updateTag } from "next/cache";
import { ORG_ROLES } from "@workspace/shared";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 10;

export default async function MembersPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    query?: string;
    page?: string;
    active?: string;
    subscription?: string;
  }>;
}>) {
  const params = await searchParams;
  const query = params.query || "";
  const page = Math.max(1, Number(params.page) || 1);
  // `?active=` = flag `isActive` del perfil; `?subscription=` = filtro nuevo
  // por suscripción gym-activa (`active` = con plan, `none` = sin plan).
  const activeParam = params.active === "true" ? true : params.active === "false" ? false : undefined;
  const subscriptionParam =
    params.subscription === "active" ? true : params.subscription === "none" ? false : undefined;

  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;
  const tag = `org:${activeOrgId}:members`;
  const statsTag = `org:${activeOrgId}:members:stats`;

  const [result, stats, featuresData, seats] = await Promise.all([
    membersService.getMembers(
      {
        query: query || undefined,
        page,
        limit: PAGE_LIMIT,
        role: ORG_ROLES.MEMBER,
        isActive: activeParam,
        hasActiveSubscription: subscriptionParam,
        includeLatestSubscription: true,
      },
      { next: { revalidate: 60, tags: [tag] } },
    ),
    membersService
      .getMemberStats({ next: { revalidate: 60, tags: [statsTag] } })
      .catch(() => null),
    getOrgFeatures(activeOrgId),
    getOrgSeats({ next: { revalidate: 60, tags: [tag] } }),
  ]);

  const portalEnabled = featuresData?.features.members_portal?.enabled === true;

  const refreshMembers = async () => {
    "use server";
    updateTag(tag);
    updateTag(statsTag);
  };

  return (
    <div className="flex flex-col gap-4">
      {portalEnabled && seats && (
        <PortalSeatsBanner used={seats.used} limit={seats.limit} pending={seats.pending} />
      )}
      <MembersClient
        initialMembers={result.data}
        initialPage={result.page}
        initialTotalPages={result.totalPages}
        initialQuery={query}
        initialActive={params.active ?? null}
        initialSubscription={params.subscription ?? null}
        initialStats={stats}
        onRefreshServer={refreshMembers}
      />
    </div>
  );
}
