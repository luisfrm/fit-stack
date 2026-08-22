import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IAiChatMessage, IAiSseEvent } from "@workspace/shared";

export interface ChatStreamCallbacks {
  onDelta: (content: string) => void;
  onModel?: (model: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
  onQuotaUpdate?: (used: number, limit: number) => void;
}

export const chatService = {
  async getUsage(options?: ApiFetchOptions) {
    return await api<import("@/lib/features/quota").AiUsage>("/ai/usage", options);
  },

  async streamChat(
    messages: IAiChatMessage[],
    { onDelta, onModel, onDone, onError, signal, onQuotaUpdate }: ChatStreamCallbacks,
  ): Promise<void> {
    const response = await api.raw("/ai/chat", {
      method: "POST",
      body: { messages },
      responseType: "stream",
      signal,
    });

    if (onQuotaUpdate) {
      const used = Number(response.headers.get("X-Ai-Credits-Used"));
      const limit = Number(response.headers.get("X-Ai-Credits-Limit"));
      if (!Number.isNaN(used) && !Number.isNaN(limit)) {
        onQuotaUpdate(used, limit);
      }
    }

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
