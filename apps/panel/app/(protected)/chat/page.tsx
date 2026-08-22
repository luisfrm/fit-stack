import { ChatView } from "@/components/chat/chat-view";
import { sessionService } from "@/lib/services/session-service";
import { getOrgFeatures, getAiUsage } from "@/lib/services/org-features";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  const { data: session } = await sessionService.getSession();
  const activeOrgId = session?.session?.activeOrganizationId || "global";

  const featuresData = await getOrgFeatures(activeOrgId);
  if (featuresData && featuresData.features.ai_chat?.enabled !== true) {
    redirect("/dashboard");
  }

  const usage = await getAiUsage({ next: { revalidate: 60 } });

  return <ChatView initialUsage={usage} />;
}
