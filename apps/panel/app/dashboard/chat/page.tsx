import { ChatView } from "@/components/chat/chat-view";
import { chatService } from "@/lib/services/chat-service";
import { AI_MODELS } from "@workspace/shared";

/**
 * Server Component (RSC): fetches the model allowlist from the API with
 * Next.js cache and passes it to the client as initial data. Falls back to
 * the shared constant if the fetch fails, so the chat never breaks.
 */
export default async function ChatPage() {
  const models = await chatService.getModels({ next: { revalidate: 3600 } });

  return <ChatView initialModels={models ?? AI_MODELS} />;
}
