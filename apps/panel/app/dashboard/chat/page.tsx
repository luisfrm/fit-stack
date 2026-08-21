import { ChatView } from "@/components/chat/chat-view";
import { chatService } from "@/lib/services/chat-service";
import { sessionService } from "@/lib/services/session-service";
import { getOrgFeatures, getAiUsage } from "@/lib/services/org-features";
import { redirect } from "next/navigation";
import { AI_MODELS } from "@workspace/shared";

/**
 * Server Component (RSC): fetches the model allowlist from the API with
 * Next.js cache and passes it to the client as initial data. Falls back to
 * the shared constant if the fetch fails, so the chat never breaks.
 */
export default async function ChatPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";

  // Feature gate: Chat IA requiere la feature `ai_chat` activa.
  const featuresData = await getOrgFeatures(activeOrgId);
  if (featuresData && featuresData.features.ai_chat?.enabled !== true) {
    redirect("/dashboard");
  }

  const [models, usage] = await Promise.all([
    chatService.getModels({ next: { revalidate: 3600 } }),
    getAiUsage({ next: { revalidate: 60 } }),
  ]);

  return <ChatView initialModels={models ?? AI_MODELS} initialUsage={usage} />;
}