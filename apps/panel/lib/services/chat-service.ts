import type { AiUsage } from "@/lib/features/quota";
import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IAiChatMessage, IAiSseEvent } from "@workspace/shared";

export interface ChatStreamCallbacks {
  onDelta: (content: string) => void;
  onModel?: (model: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
  onUsage?: (usage: AiUsage) => void;
}

export interface ChatConversationDto {
  id: string;
  title: string;
  modelUsed?: string;
  messages: IAiChatMessage[];
  updatedAt?: string;
}

interface StreamContext {
  callbacks: ChatStreamCallbacks;
  emitError: (message: string) => void;
}

/**
 * Parses an individual SSE line and returns the typed event or null if invalid or empty.
 */
function parseSseLine(rawLine: string): IAiSseEvent | null {
  const line = rawLine.trim();
  if (!line.startsWith("data:")) return null;

  const payload = line.slice(5).trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload) as IAiSseEvent;
  } catch {
    return null;
  }
}

/**
 * Dispatches an SSE event to its corresponding callback.
 * Returns false if the stream should terminate (error or done), true to continue.
 */
function handleSseEvent(event: IAiSseEvent, { callbacks, emitError }: StreamContext): boolean {
  if ("content" in event && event.content) {
    callbacks.onDelta(event.content);
    return true;
  }

  if ("model" in event) {
    callbacks.onModel?.(event.model);
    return true;
  }

  if ("usage" in event && event.usage) {
    callbacks.onUsage?.({
      monthly: event.usage.monthly,
      remaining: event.usage.remaining,
      disabled: false,
      periodStart: event.usage.periodStart,
    });
    return true;
  }

  if ("error" in event) {
    emitError(event.error);
    return false;
  }

  if ("done" in event) {
    callbacks.onDone?.();
    return false;
  }

  return true;
}

/**
 * Processes a list of raw SSE event strings from the stream buffer.
 * Returns false if stream termination was requested by an event.
 */
function processSseChunk(events: string[], context: StreamContext): boolean {
  for (const rawEvent of events) {
    const event = parseSseLine(rawEvent);
    if (!event) continue;

    const shouldContinue = handleSseEvent(event, context);
    if (!shouldContinue) return false;
  }
  return true;
}

export const chatService = {
  async getUsage(options?: ApiFetchOptions) {
    return await api<AiUsage>("/ai/usage", options);
  },

  async getConversations(options?: ApiFetchOptions): Promise<ChatConversationDto[]> {
    const res = await api<{ data: ChatConversationDto[] }>("/ai/conversations", options);
    return res.data ?? [];
  },

  async saveConversation(conversation: ChatConversationDto, options?: ApiFetchOptions): Promise<void> {
    await api(`/ai/conversations/${encodeURIComponent(conversation.id)}`, {
      method: "PUT",
      body: conversation,
      ...(options as object),
    });
  },

  async deleteConversation(id: string, options?: ApiFetchOptions): Promise<void> {
    await api(`/ai/conversations/${encodeURIComponent(id)}`, { method: "DELETE", ...(options as object) });
  },

  async streamChat(
    messages: IAiChatMessage[],
    callbacks: ChatStreamCallbacks,
  ): Promise<void> {
    // Global rule: raw API errors are never shown directly to the user toast;
    // they are logged to console and views display generic friendly messages.
    const emitError = (message: string) => {
      console.error("[chat-stream]", message);
      callbacks.onError?.(message);
    };

    const response = await api.raw("/ai/chat", {
      method: "POST",
      body: { messages },
      responseType: "stream",
      signal: callbacks.signal,
    });

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
      emitError(errBody?.error ?? "Error al comunicarse con el asistente");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      emitError("Sin respuesta del servidor");
      return;
    }

    const context: StreamContext = { callbacks, emitError };
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        const shouldContinue = processSseChunk(events, context);
        if (!shouldContinue) return;
      }
      callbacks.onDone?.();
    } catch (err) {
      if (callbacks.signal?.aborted) {
        callbacks.onDone?.();
        return;
      }
      const message = err instanceof Error ? err.message : "Error inesperado en el stream";
      console.error({ err, message })
      emitError("Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo.");
    }
  },
};
