import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { AiModelInfo, IAiChatMessage, IAiSseEvent } from "@workspace/shared";

export interface ChatStreamCallbacks {
  onDelta: (content: string) => void;
  /** Fired with the actual model that answered (relevant with `openrouter/free`). */
  onModel?: (model: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

/**
 * Chat AI service — streams token deltas from the api-worker via SSE.
 * Uses ofetch (never native fetch). The response is not cached: it's a
 * streaming POST consumed only from client components.
 */
export const chatService = {
  /**
   * Available models (allowlist). Used from RSC pages with Next.js cache
   * options; the chat itself receives the list as props.
   */
  async getModels(options?: ApiFetchOptions): Promise<AiModelInfo[] | null> {
    try {
      const res = await api<{ data: AiModelInfo[] }>("/ai/models", options);
      return res.data ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Streams a chat completion. `onDelta` fires with each text chunk;
   * `onDone` after the stream closes; `onError` on failures or mid-stream
   * errors. Pass an AbortController signal to stop generation.
   */
  async streamChat(
    model: string,
    messages: IAiChatMessage[],
    { onDelta, onModel, onDone, onError, signal }: ChatStreamCallbacks,
  ): Promise<void> {
    const response = await api.raw("/ai/chat", {
      method: "POST",
      body: { model, messages },
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
      // User aborted (stop button) — treat as graceful end
      if (signal?.aborted) {
        onDone?.();
        return;
      }
      onError?.(err instanceof Error ? err.message : "Error inesperado en el stream");
    }
  },
};
