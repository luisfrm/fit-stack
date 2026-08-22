import { knowledgeService } from "@/lib/services/knowledge-service";
import { updateTag } from "next/cache";
import { KnowledgeSettings } from "./knowledge-settings";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const { data } = await knowledgeService.getAll({
    next: { revalidate: 300, tags: ["console:knowledge"] },
  });

  const refreshKnowledge = async () => {
    "use server";
    updateTag("console:knowledge");
  };

  return <KnowledgeSettings initialDocs={data} onSaved={refreshKnowledge} />;
}
