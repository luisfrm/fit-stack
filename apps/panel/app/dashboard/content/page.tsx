import { cmsContentService } from "@/lib/services/cms-content-service";
import { ContentListClient } from "./content-list-client";
import { updateTag } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const pages = await cmsContentService.getPages({
    next: { revalidate: 60, tags: ["panel:cms:pages"] },
  });

  const refreshContent = async () => {
    "use server";
    updateTag("panel:cms:pages");
  };
  void refreshContent;

  return <ContentListClient initialPages={pages} />;
}
