import { ChatView } from "@/components/chat/chat-view";
import { sessionService } from "@/lib/services/session-service";
import { getOrgFeatures, getAiUsage } from "@/lib/services/org-features";
import { chatService } from "@/lib/services/chat-service";
import { redirect } from "next/navigation";
import type { ChatConversationDto } from "@/lib/services/chat-service";

export default async function ChatPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId;

  if (!activeOrgId) {
    redirect("/dashboard");
  }

  const featuresData = await getOrgFeatures(activeOrgId);
  if (featuresData && featuresData.features.ai_chat?.enabled !== true) {
    redirect("/dashboard");
  }

  const [usage, conversations] = await Promise.all([
    getAiUsage(),
    chatService.getConversations({ next: { revalidate: 30, tags: ["chat:history"] } }).catch(() => [] as ChatConversationDto[]),
  ]);

  return <ChatView initialUsage={usage} initialConversations={conversations} />;
}
