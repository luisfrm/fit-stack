/**
 * AI chat configuration.
 * Single source of truth for model allowlist.
 * Only glm-4.7-flash in Workers AI + OpenRouter free chain.
 */

export const WORKERS_AI_TEXT_MODEL = "@cf/zai-org/glm-4.7-flash" as const;

export const OPENROUTER_TEXT_MODEL_CHAIN = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "dots-studio/dots-3-note-preview:free",
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

// Compatibility with code importing AI_MODEL_IDS / OPENROUTER_FREE_MODEL_IDS
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

/**
 * Display metadata per OpenRouter model. `satisfies Record<OpenRouterChatModelId, …>`
 * makes the catalog EXHAUSTIVE: editing `OPENROUTER_TEXT_MODEL_CHAIN` without
 * updating this map is a compile error, never a silent drift.
 */
const OPENROUTER_MODEL_META = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    label: "Nemotron 3 Ultra 550B Free",
    description: "OpenRouter · NVIDIA — primary chain",
  },
  "nvidia/nemotron-3.5-super-vl:free": {
    label: "Nemotron 3.5 Super VL Free",
    description: "OpenRouter · NVIDIA — fallback #1",
  },
  "dots-studio/dots-3-note-preview:free": {
    label: "Dots 3 Note Preview Free",
    description: "OpenRouter · Dots Studio — fallback #2",
  },
} as const satisfies Record<OpenRouterChatModelId, { label: string; description: string }>;

export const AI_MODELS: AiModelInfo[] = [
  // Order follows the chain: the catalog can never disagree with the routing.
  ...OPENROUTER_TEXT_MODEL_CHAIN.map((id) => ({
    id,
    ...OPENROUTER_MODEL_META[id],
    provider: "openrouter" as const,
  })),
  {
    id: WORKERS_AI_TEXT_MODEL,
    label: "GLM 4.7 Flash",
    description: "Workers AI · fast and lightweight",
    provider: "workers-ai",
  },
];

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

// ── Chat context window (SSOT for frontend and backend) ──
export const CHAT_HISTORY_LIMIT = 6 as const; // last N messages sent to LLM
export const CHAT_MAX_STORED = 10 as const; // max persisted per conversation (sliding window)
export const CHAT_MAX_CONVERSATIONS = 20 as const; // max conversations per user/org

// ── Chat budget limits (do not hardcode in routes) ──
export const AI_CHAT_LIMITS = {
  /** Max characters for user message (single query/prompt). */
  maxUserMessageChars: 500,
  /** Max characters per history message (user/assistant). */
  maxHistoryMessageChars: 2_000,
  /** Max output tokens in normal response. */
  maxOutputTokens: 1200,
  /** Max output tokens when tool calling is used (special case). */
  maxToolOutputTokens: 2_048,
  /** Max messages in history sent to model (last N). */
  maxHistoryMessages: CHAT_HISTORY_LIMIT,
  /** Max messages schema validation allows (hard limit). */
  maxMessages: 50,
  /** Max total characters across client messages per request (input cap). */
  maxInputChars: 8_000,
} as const;

/** RAG config: chunking + retrieval for Knowledge Base. */
export const RAG_CONFIG = {
  topK: 4,
  minSimilarity: 0.35,
  chunkSizeChars: 800,
  chunkOverlapChars: 100,
  maxContextChars: 2_000,
} as const;

// ── Credits (1 credit = 1K tokens) ──
export const AI_CREDIT_CONSTANTS = {
  tokensPerCredit: 1_000,
  /** Multiplier per model (x1.0 for GLM and openrouter/free for now). */
  creditMultiplier: 1.0,
  /** Daily cap fraction against monthly pool (20% to prevent exhausting quota in one day). */
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
 * Splits text into overlapping chunks for embedding (RAG_CONFIG).
 * Breaks preferentially on double-newlines, newlines, or sentence boundaries.
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

/** Actual model that answered (relevant with fallback). */
export interface IAiSseModel {
  model: string;
}

export interface IAiSseDone {
  done: true;
}

export interface IAiSseError {
  error: string;
}

export interface IAiSseUsage {
  usage: {
    monthly: { used: number; limit: number };
    remaining: number | null;
    periodStart: string;
  };
}

export type IAiSseEvent = IAiSseDelta | IAiSseModel | IAiSseDone | IAiSseError | IAiSseUsage;
