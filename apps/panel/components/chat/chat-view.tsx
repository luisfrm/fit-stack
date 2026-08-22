"use client";

import * as React from "react";
import { Plus, Send, Sparkles, Square, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Spinner,
  Text,
  Textarea,
  toast,
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { IAiChatMessage } from "@workspace/shared";
import { chatService } from "@/lib/services/chat-service";
import { AiQuotaBanner } from "./ai-quota-banner";
import type { AiUsage } from "@/lib/features/quota";
import { isQuotaExhausted } from "@/lib/features/quota";

interface UiChat {
  id: string;
  title: string;
  modelUsed?: string;
  messages: IAiChatMessage[];
}

function createEmptyChat(): UiChat {
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    messages: [],
  };
}

function buildTitle(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

interface ChatViewProps {
  readonly initialUsage?: AiUsage | null;
}

export function ChatView({ initialUsage }: ChatViewProps) {
  const [chats, setChats] = React.useState<UiChat[]>(() => [createEmptyChat()]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [usage, setUsage] = React.useState<AiUsage | null | undefined>(initialUsage);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const dailyExhausted = isQuotaExhausted(usage?.monthly ?? (usage as unknown as { daily?: { used: number; limit: number } })?.daily);

  const isAwaitingResponse =
    isStreaming &&
    activeChat?.messages[activeChat.messages.length - 1]?.role === "user";

  React.useEffect(() => {
    setActiveChatId((current) => current ?? chats[0]?.id ?? null);
  }, [chats]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages, isStreaming]);

  const createChat = () => {
    const empty = chats.find((chat) => chat.messages.length === 0);
    if (empty) {
      setActiveChatId(empty.id);
      return;
    }
    const chat = createEmptyChat();
    setChats((prev) => [...prev, chat]);
    setActiveChatId(chat.id);
  };

  const deleteChat = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const appendAssistantDelta = (chatId: string, delta: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        const last = chat.messages[chat.messages.length - 1];
        if (last && last.role === "assistant") {
          return {
            ...chat,
            messages: [...chat.messages.slice(0, -1), { ...last, content: last.content + delta }],
          };
        }
        return {
          ...chat,
          messages: [...chat.messages, { role: "assistant", content: delta }],
        };
      }),
    );
  };

  const refreshUsage = React.useCallback(async () => {
    try {
      const fresh = await chatService.getUsage();
      if (fresh) setUsage(fresh);
    } catch {
      // silencioso
    }
  }, []);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || isStreaming || !activeChat) return;
    if (dailyExhausted) {
      toast.error("No tienes créditos disponibles en este ciclo");
      return;
    }

    const userMessage: IAiChatMessage = { role: "user", content };
    const messages = [...activeChat.messages, userMessage];
    const chatId = activeChat.id;

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              title: chat.messages.length === 0 ? buildTitle(content) : chat.title,
              modelUsed: undefined,
              messages,
            }
          : chat,
      ),
    );
    setDraft("");

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    try {
      await chatService.streamChat(messages, {
        signal: controller.signal,
        onDelta: (delta) => appendAssistantDelta(chatId, delta),
        onModel: (model) => {
          setChats((prev) =>
            prev.map((chat) => (chat.id === chatId ? { ...chat, modelUsed: model } : chat)),
          );
        },
        onDone: () => undefined,
        onError: (message) => toast.error(message),
        onQuotaUpdate: (used, limit) => {
          setUsage((prev) => ({
            monthly: { used, limit },
            remaining: limit === 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
            disabled: false,
            periodStart: prev?.periodStart ?? new Date().toISOString(),
            ...(prev && (prev as unknown as { daily?: unknown }).daily ? { daily: { used, limit } } : {}),
            ...(prev && (prev as unknown as { weekly?: unknown }).weekly ? { weekly: { used, limit } } : {}),
          }));
        },
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(err instanceof Error ? err.message : "Error al enviar el mensaje");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      void refreshUsage();
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const chatList = (
    <>
      <Button onClick={createChat} leftIcon={<Plus className="size-4" />} fullWidth>
        Nuevo chat
      </Button>
      <div className="flex flex-1 min-h-0 flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1">
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => setActiveChatId(chat.id)}
            className={cn(
              "group flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
              chat.id === activeChatId
                ? "border-primary/20 bg-primary/10"
                : "border-border bg-input hover:bg-surface",
            )}
          >
            <span
              className={cn(
                "truncate text-sm font-medium",
                chat.id === activeChatId ? "text-primary" : "text-foreground",
              )}
            >
              {chat.title}
            </span>
            <Trash2
              className="size-3.5 shrink-0 cursor-pointer text-foreground-dim opacity-0 transition-opacity group-hover:opacity-70 hover:text-destructive"
              onClick={(event) => deleteChat(chat.id, event)}
            />
          </button>
        ))}
        {chats.length === 0 && (
          <Text size="xs" variant="muted" className="px-2">
            Sin conversaciones
          </Text>
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-[60svh] flex-col gap-4">
      <AiQuotaBanner usage={usage} />

      <div className="flex flex-col gap-3">
        <div>
          <Text as="p" size="lg" weight="bold" uppercase italic>
            Chat IA
          </Text>
          <Text variant="muted" size="sm">
            Asistente configurado desde Console (fallback automático entre providers)
          </Text>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <aside className="hidden w-64 flex-col gap-3 md:flex">{chatList}</aside>

        <Card className="flex min-w-0 flex-1 flex-col">
          {activeChat ? (
            <>
              <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto custom-scrollbar p-4">
                {activeChat.messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                        message.role === "user"
                          ? "border-primary/20 bg-primary/15 text-foreground"
                          : "border-white/5 bg-surface text-foreground",
                      )}
                    >
                      {message.content ? (
                        message.content
                      ) : (
                        <span className="inline-flex items-center gap-2 text-foreground-dim">
                          <Spinner className="size-3.5" />
                          Pensando...
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {isAwaitingResponse && (
                  <div className="flex justify-start">
                    <div
                      className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-surface px-4 py-3"
                      aria-label="El asistente está escribiendo"
                    >
                      {[0, 1, 2].map((dot) => (
                        <span
                          key={dot}
                          className="size-1.5 rounded-full bg-foreground-dim animate-typing-bounce"
                          style={{ animationDelay: `${dot * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {activeChat.modelUsed && (
                  <div className="flex justify-start">
                    <Badge variant="outline" size="sm">
                      Modelo: {activeChat.modelUsed}
                    </Badge>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-white/5 p-3">
                {dailyExhausted ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                    <Badge variant="warning" size="sm" className="shrink-0 uppercase tracking-widest text-[10px]">
                      Sin créditos
                    </Badge>
                    <Text size="xs" variant="muted" className="leading-relaxed">
                      No tienes créditos disponibles en este ciclo. Se renuevan con el ciclo de suscripción (o el día 1).
                    </Text>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <Textarea
                      placeholder="Escribe tu mensaje... (Enter para enviar, Shift+Enter para nueva línea)"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isStreaming}
                      className="min-h-[56px] max-h-40"
                    />
                    {isStreaming ? (
                      <Button
                        variant="danger"
                        size="icon"
                        onClick={stopGeneration}
                        title="Detener generación"
                        aria-label="Detener generación"
                      >
                        <Square className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        onClick={() => void sendMessage()}
                        disabled={!draft.trim()}
                        title="Enviar"
                        aria-label="Enviar mensaje"
                      >
                        <Send className="size-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <Text weight="bold" size="lg">
                  Asistente de IA
                </Text>
                <Text variant="muted" size="sm">
                  Comienza una conversación
                </Text>
              </div>
              <Button onClick={createChat} leftIcon={<Plus className="size-4" />}>
                Nuevo chat
              </Button>
            </div>
          )}
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto custom-scrollbar md:hidden">
        <Button
          size="xs"
          variant="outlined"
          onClick={createChat}
          leftIcon={<Plus className="size-3" />}
          className="shrink-0"
        >
          Nuevo
        </Button>
        {chats.map((chat) => (
          <button
            key={chat.id}
            type="button"
            onClick={() => setActiveChatId(chat.id)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              chat.id === activeChatId
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-border bg-input text-foreground",
            )}
          >
            {chat.title}
          </button>
        ))}
      </div>
    </div>
  );
}
