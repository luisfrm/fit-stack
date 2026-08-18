"use client";

import * as React from "react";
import { Plus, Send, Sparkles, Square, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  SimpleSelect,
  Spinner,
  Text,
  Textarea,
  toast,
  type SimpleSelectOption,
} from "@workspace/ui/components";
import { cn } from "@workspace/ui/lib/utils";
import type { AiModelInfo, ChatModelId, IAiChatMessage } from "@workspace/shared";
import { chatService } from "@/lib/services/chat-service";

interface UiChat {
  id: string;
  title: string;
  model: ChatModelId;
  modelUsed?: string;
  messages: IAiChatMessage[];
}

const MODEL_OPTIONS = (models: readonly AiModelInfo[]): SimpleSelectOption[] =>
  models.map((model) => ({
    value: model.id,
    label:
      model.provider === "openrouter"
        ? `OpenRouter · ${model.label}`
        : `Workers AI · ${model.label}`,
    description: model.description,
  }));

function resolveDefaultModel(models: readonly AiModelInfo[]): ChatModelId {
  return (
    (models.find((model) => model.id === "openrouter/free")?.id as ChatModelId | undefined) ??
    (models[0]?.id as ChatModelId | undefined) ??
    "openrouter/free"
  );
}

function createEmptyChat(model: ChatModelId): UiChat {
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    model,
    messages: [],
  };
}

function buildTitle(content: string): string {
  const clean = content.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

interface ChatViewProps {
  /** Model allowlist fetched by the RSC page (falls back to shared constant). */
  readonly initialModels: readonly AiModelInfo[];
}

export function ChatView({ initialModels }: ChatViewProps) {
  const [chats, setChats] = React.useState<UiChat[]>(() => [
    createEmptyChat(resolveDefaultModel(initialModels)),
  ]);
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  const modelOptions = React.useMemo(() => MODEL_OPTIONS(initialModels), [initialModels]);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;

  // Activate the first chat on mount
  React.useEffect(() => {
    setActiveChatId((current) => current ?? chats[0]?.id ?? null);
  }, [chats]);

  // Auto-scroll to the latest message
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeChat?.messages]);

  const createChat = () => {
    const empty = chats.find((chat) => chat.messages.length === 0);
    if (empty) {
      setActiveChatId(empty.id);
      return;
    }
    const chat = createEmptyChat(resolveDefaultModel(initialModels));
    setChats((prev) => [...prev, chat]);
    setActiveChatId(chat.id);
  };

  const deleteChat = (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setChats((prev) => prev.filter((chat) => chat.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const changeModel = (model: string) => {
    if (!activeChatId) return;
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChatId ? { ...chat, model: model as ChatModelId } : chat,
      ),
    );
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

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || isStreaming || !activeChat) return;

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
      await chatService.streamChat(
        activeChat.model,
        messages,
        {
          signal: controller.signal,
          onDelta: (delta) => appendAssistantDelta(chatId, delta),
          onModel: (model) => {
            setChats((prev) =>
              prev.map((chat) => (chat.id === chatId ? { ...chat, modelUsed: model } : chat)),
            );
          },
          onDone: () => undefined,
          onError: (message) => toast.error(message),
        },
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        toast.error(err instanceof Error ? err.message : "Error al enviar el mensaje");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
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

  const usedModelLabel =
    activeChat?.modelUsed && activeChat.modelUsed !== activeChat.model
      ? (modelOptions.find((option) => option.value === activeChat.modelUsed)?.label ??
        activeChat.modelUsed)
      : null;

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Text as="p" size="lg" weight="bold" uppercase italic>
            Chat IA
          </Text>
          <Text variant="muted" size="sm">
            Asistente con Cloudflare Workers AI y OpenRouter (gratuito)
          </Text>
        </div>
        {activeChat && (
          <div className="w-full sm:w-72">
            <SimpleSelect
              label="Proveedor / Modelo"
              size="sm"
              value={activeChat.model}
              onChange={changeModel}
              options={modelOptions}
            />
          </div>
        )}
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
                {usedModelLabel && (
                  <div className="flex justify-start">
                    <Badge variant="outline" size="sm">
                      Modelo: {usedModelLabel}
                    </Badge>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="border-t border-white/5 p-3">
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
                  Elige un proveedor/modelo y comienza una conversación
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
