import { contentService } from "@/lib/services/content-service";
import { ContentListClient } from "./content-list-client";
import { sessionService } from "@workspace/auth/service";
import { getOrgFeatures } from "@/lib/services/org-features";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;

  // Feature gate: CMS requiere la feature `cms` activa (downgrade = hide).
  const featuresData = await getOrgFeatures(activeOrgId);
  if (featuresData && featuresData.features.cms?.enabled !== true) {
    redirect("/dashboard");
  }

  // No fetch cache: page is force-dynamic and mutations
  // (create/delete/edit) refresh via router.refresh() on the client —
  // this way the listing never displays stale data.
  const pages = await contentService.getPages();

  return <ContentListClient initialPages={pages} />;
}