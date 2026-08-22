/**
 * AI chat configuration.
 * Single source of truth for model allowlist.
 * Solo glm-4.7-flash en Workers AI + cadena OpenRouter free.
 */

export const WORKERS_AI_TEXT_MODEL = "@cf/zai-org/glm-4.7-flash" as const;

export const OPENROUTER_TEXT_MODEL_CHAIN = [
  "z-ai/glm-5.2:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
] as const;

export const WORKERS_AI_EMBEDDING_MODEL = "@cf/baai/bge-m3" as const;
export const WORKERS_AI_EMBEDDING_DIMS = 1024 as const;

export const ALL_CHAT_MODEL_IDS = [
  WORKERS_AI_TEXT_MODEL,
  ...OPENROUTER_TEXT_MODEL_CHAIN,
] as const;

export type ChatModelId = (typeof ALL_CHAT_MODEL_IDS)[number];
export type OpenRouterChatModelId = (typeof OPENROUTER_TEXT_MODEL_CHAIN)[number];
export type WorkersAiChatModelId = typeof WORKERS_AI_TEXT_MODEL;

// Compat con código que importaba AI_MODEL_IDS / OPENROUTER_FREE_MODEL_IDS
export const AI_MODEL_IDS = [WORKERS_AI_TEXT_MODEL] as const;
export const OPENROUTER_FREE_MODEL_IDS = [...OPENROUTER_TEXT_MODEL_CHAIN] as const;
export type AiModelId = WorkersAiChatModelId;
export type OpenRouterModelId = OpenRouterChatModelId;

export type AiProvider = "workers-ai" | "openrouter";

export function getAiProvider(modelId: string): AiProvider {
  return modelId.startsWith("@cf/") ? "workers-ai" : "openrouter";
}

export interface AiModelInfo {
  id: ChatModelId;
  label: string;
  description: string;
  provider: AiProvider;
}

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "z-ai/glm-5.2:free",
    label: "GLM 5.2 Free",
    description: "OpenRouter · z-ai — cadena primaria",
    provider: "openrouter",
  },
  {
    id: "poolside/laguna-s-2.1:free",
    label: "Laguna S 2.1 Free",
    description: "OpenRouter · Poolside — fallback #1",
    provider: "openrouter",
  },
  {
    id: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning Free",
    description: "OpenRouter · NVIDIA — fallback #2",
    provider: "openrouter",
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    description: "Workers AI · rápido y económico",
    provider: "workers-ai",
  },
] as const;

// ── Provider default (platform_setting ai_provider_default) ──
export const AI_PROVIDER_IDS = ["openrouter", "workers-ai"] as const;
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export const AI_DEFAULT_PROVIDER: AiProviderId = "openrouter";
export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  openrouter: "OpenRouter (free chain)",
  "workers-ai": "Workers AI (GLM 4.7)",
};

export function resolveAiProviders(
  configured?: string | null,
): { primary: AiProviderId; fallback: AiProviderId } {
  const primary =
    configured === "workers-ai" || configured === "openrouter" ? configured : AI_DEFAULT_PROVIDER;
  const fallback = primary === "openrouter" ? "workers-ai" : "openrouter";
  return { primary, fallback };
}

export function getProviderModelChain(provider: AiProviderId): readonly string[] {
  return provider === "openrouter" ? OPENROUTER_TEXT_MODEL_CHAIN : [WORKERS_AI_TEXT_MODEL];
}

export function getOrderedModelChain(provider?: string | null): readonly string[] {
  const { primary, fallback } = resolveAiProviders(provider);
  return [...getProviderModelChain(primary), ...getProviderModelChain(fallback)];
}

// ── Límites de balance del chat (no hardcodear en rutas) ──
export const AI_CHAT_LIMITS = {
  /** Máx. caracteres del mensaje del usuario (una pregunta/rutina). */
  maxUserMessageChars: 500,
  /** Máx. caracteres por mensaje del historial (user/assistant). */
  maxHistoryMessageChars: 2_000,
  /** Máx. tokens de salida en una respuesta normal. */
  maxOutputTokens: 800,
  /** Máx. tokens de salida cuando hay tool (caso especial). */
  maxToolOutputTokens: 2_048,
  /** Máx. mensajes en el historial enviado al modelo (últimos N). */
  maxHistoryMessages: 10,
  /** Máx. mensajes que valida el schema (límite duro). */
  maxMessages: 50,
  /** Máx. caracteres totales de los mensajes del cliente por request (input cap). */
  maxInputChars: 8_000,
} as const;

/** Config RAG: chunking + recuperación para la Base de Conocimiento. */
export const RAG_CONFIG = {
  topK: 4,
  minSimilarity: 0.35,
  chunkSizeChars: 800,
  chunkOverlapChars: 100,
  maxContextChars: 2_000,
} as const;

// ── Créditos (1 crédito = 1K tokens) ──
export const AI_CREDIT_CONSTANTS = {
  tokensPerCredit: 1_000,
  /** Multiplicador por modelo (x1.0 para GLM y openrouter/free por ahora). */
  creditMultiplier: 1.0,
  /** Fracción diaria como guard del mensual (20% para evitar fundir todo en un día). */
  dailyCapFraction: 0.2,
} as const;

export function estimateCreditsFromMessages(
  messages: { role: string; content: string }[],
  maxTokens: number = AI_CHAT_LIMITS.maxOutputTokens,
  extraChars = 0,
): number {
  const chars = messages.reduce((acc, m) => acc + m.content.length, 0) + extraChars;
  const inputTokens = Math.ceil(chars / 4);
  const total = inputTokens + maxTokens;
  return Math.max(1, Math.ceil(total / AI_CREDIT_CONSTANTS.tokensPerCredit));
}

/**
 * Divide texto en chunks solapados para embedding (RAG_CONFIG).
 * Corta preferentemente en saltos de línea o fin de oración.
 */
export function splitIntoChunks(content: string): string[] {
  const text = content.trim();
  if (!text) return [];

  const { chunkSizeChars, chunkOverlapChars } = RAG_CONFIG;
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSizeChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const breakAt = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (breakAt > chunkSizeChars * 0.5) {
        end = start + breakAt + 1;
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(end - chunkOverlapChars, start + 1);
  }

  return chunks;
}

export function creditsFromUsage(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): number {
  const total =
    usage.total_tokens ??
    (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
  return Math.max(1, Math.ceil(total / AI_CREDIT_CONSTANTS.tokensPerCredit));
}

export type AiChatRole = "system" | "user" | "assistant";

export interface IAiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface IAiChatRequest {
  model?: string;
  messages: IAiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/** SSE event contract (POST /api/ai/chat). */
export interface IAiSseDelta {
  content?: string;
}

/** Actual model that answered (relevant con fallback). */
export interface IAiSseModel {
  model: string;
}

export interface IAiSseDone {
  done: true;
}

export interface IAiSseError {
  error: string;
}

export type IAiSseEvent = IAiSseDelta | IAiSseModel | IAiSseDone | IAiSseError;
