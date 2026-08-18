/**
 * AI chat configuration.
 * Single source of truth for the model allowlist consumed by both
 * the api-worker (server-side validation + provider routing) and the
 * panel (RSC-fetched model selector).
 *
 * Providers:
 * - "workers-ai": Cloudflare Workers AI (OpenAI-compatible endpoint).
 * - "openrouter": OpenRouter. `openrouter/free` is the automatic free
 *   router — OpenRouter picks the best available free model and falls
 *   back between them automatically when quotas are exhausted.
 */

export const AI_MODEL_IDS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/nvidia/nemotron-3-120b-a12b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
] as const;

export const OPENROUTER_FREE_MODEL_IDS = ["openrouter/free"] as const;

export const ALL_CHAT_MODEL_IDS = [
  ...AI_MODEL_IDS,
  ...OPENROUTER_FREE_MODEL_IDS,
] as const;

export type AiModelId = (typeof AI_MODEL_IDS)[number];
export type OpenRouterModelId = (typeof OPENROUTER_FREE_MODEL_IDS)[number];
export type ChatModelId = (typeof ALL_CHAT_MODEL_IDS)[number];

export type AiProvider = "workers-ai" | "openrouter";

export function getAiProvider(modelId: string): AiProvider {
  return (OPENROUTER_FREE_MODEL_IDS as readonly string[]).includes(modelId)
    ? "openrouter"
    : "workers-ai";
}

export interface AiModelInfo {
  id: AiModelId | OpenRouterModelId;
  label: string;
  description: string;
  provider: AiProvider;
}

export const AI_MODELS: AiModelInfo[] = [
  {
    id: "openrouter/free",
    label: "Enrutador gratuito automático",
    description: "OpenRouter elige el mejor modelo gratuito disponible",
    provider: "openrouter",
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    description: "Rápido y económico para tareas cotidianas",
    provider: "workers-ai",
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    description: "Google Gemma 4 — instructivo balanceado",
    provider: "workers-ai",
  },
  {
    id: "@cf/nvidia/nemotron-3-120b-a12b",
    label: "Nemotron 3 120B",
    description: "NVIDIA — alta capacidad de razonamiento",
    provider: "workers-ai",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B",
    description: "Meta Llama 3.3 — potente y popular",
    provider: "workers-ai",
  },
] as const;

export type AiChatRole = "system" | "user" | "assistant";

export interface IAiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface IAiChatRequest {
  model: string;
  messages: IAiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/** SSE event contract (POST /api/ai/chat). */
export interface IAiSseDelta {
  content?: string;
}

/** Actual model that answered (relevant with `openrouter/free`). */
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
