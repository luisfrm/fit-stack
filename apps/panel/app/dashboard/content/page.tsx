import { contentService } from "@/lib/services/content-service";
import { ContentListClient } from "./content-list-client";
import { sessionService } from "@/lib/services/session-service";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";
  const tag = `org:${activeOrgId}:cms:pages`;

  const pages = await contentService.getPages({
    next: { revalidate: 60, tags: [tag] },
  });

  const refreshContent = async () => {
    "use server";
    updateTag(tag);
  };
  void refreshContent;

  return <ContentListClient initialPages={pages} />;
}
