import { contentService } from "@/lib/services/content-service";
import { ContentListClient } from "./content-list-client";
import { sessionService } from "@/lib/services/session-service";
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

  const tag = `org:${activeOrgId}:cms:pages`;

  const pages = await contentService.getPages({
    next: { revalidate: 60, tags: [tag] },
  });

  return <ContentListClient initialPages={pages} />;
}