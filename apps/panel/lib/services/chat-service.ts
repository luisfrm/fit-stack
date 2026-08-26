import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IAiChatMessage, IAiSseEvent } from "@workspace/shared";

export interface ChatStreamCallbacks {
  onDelta: (content: string) => void;
  onModel?: (model: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
  onUsage?: (usage: import("@/lib/features/quota").AiUsage) => void;
}

export interface ChatConversationDto {
  id: string;
  title: string;
  modelUsed?: string;
  messages: IAiChatMessage[];
  updatedAt?: string;
}

export const chatService = {
  async getUsage(options?: ApiFetchOptions) {
    return await api<import("@/lib/features/quota").AiUsage>("/ai/usage", options);
  },

  async getConversations(options?: ApiFetchOptions): Promise<ChatConversationDto[]> {
    const res = await api<{ data: ChatConversationDto[] }>("/ai/conversations", options);
    return res.data ?? [];
  },

  async saveHistory(conversations: ChatConversationDto[], options?: ApiFetchOptions): Promise<void> {
    await api("/ai/conversations", { method: "PUT", body: { conversations }, ...(options as object) });
  },

  async deleteConversation(id: string, options?: ApiFetchOptions): Promise<void> {
    await api(`/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE", ...(options as object) });
  },

  async streamChat(
    messages: IAiChatMessage[],
    { onDelta, onModel, onDone, onError, signal, onUsage }: ChatStreamCallbacks,
  ): Promise<void> {
    const response = await api.raw("/ai/chat", {
      method: "POST",
      body: { messages },
      responseType: "stream",
      signal,
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
      onError?.(errBody?.error ?? "Error al comunicarse con el asistente");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError?.("Sin respuesta del servidor");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const line = rawEvent.trim();
          if (!line.startsWith("data:")) continue;

          const payload = line.slice(5).trim();
          if (!payload) continue;

          const event = JSON.parse(payload) as IAiSseEvent;
          if ("content" in event && event.content) {
            onDelta(event.content);
          } else if ("model" in event) {
            onModel?.(event.model);
          } else if ("usage" in event && (event as { usage?: unknown }).usage) {
            const u = (event as Extract<IAiSseEvent, { usage: unknown }>).usage as {
              monthly: { used: number; limit: number };
              remaining: number | null;
              periodStart: string;
            };
            onUsage?.({
              monthly: u.monthly,
              remaining: u.remaining,
              disabled: false,
              periodStart: u.periodStart,
            });
          } else if ("error" in event) {
            onError?.(event.error);
            return;
          } else if ("done" in event) {
            onDone?.();
            return;
          }
        }
      }
      onDone?.();
    } catch (err) {
      if (signal?.aborted) {
        onDone?.();
        return;
      }
      onError?.(err instanceof Error ? err.message : "Error inesperado en el stream");
    }
  },
};
