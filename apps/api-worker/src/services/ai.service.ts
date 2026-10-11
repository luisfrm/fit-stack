import { ofetch } from 'ofetch';
import {
  createOpenRouterClient,
  createWorkersAIClient,
  workersAiRunUrl,
} from '../lib/ai';
import type { Env } from '../lib/env';
import {
  AI_CHAT_LIMITS,
  WORKERS_AI_EMBEDDING_DIMS,
  WORKERS_AI_EMBEDDING_MODEL,
  getAiProvider,
  type IAiChatMessage,
} from '@workspace/shared';
import type OpenAI from 'openai';

export const AI_DEFAULT_MAX_TOKENS = AI_CHAT_LIMITS.maxOutputTokens;
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_MAX_MESSAGES = AI_CHAT_LIMITS.maxHistoryMessages;

export interface AiChatOptions {
  model: string;
  messages: IAiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** If tool, allows maxToolOutputTokens. */
  isTool?: boolean;
}

export interface AiChatDelta {
  content: string;
}

export interface AiChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AiChatStream {
  stream: AsyncGenerator<AiChatDelta, void, void>;
  /** Resolves to the actual model that answered (before the first delta). */
  model: Promise<string>;
  /** Resolves to provider usage (if reporting include_usage). */
  usage: Promise<AiChatUsage | null>;
}

function clampMaxTokens(maxTokens: number | undefined, isTool?: boolean): number {
  const cap = isTool ? AI_CHAT_LIMITS.maxToolOutputTokens : AI_CHAT_LIMITS.maxOutputTokens;
  const v = maxTokens ?? cap;
  return Math.min(Math.max(1, v), cap);
}

function buildChatBody(
  client: OpenAI,
  { model, messages, temperature, maxTokens, signal, isTool }: AiChatOptions,
) {
  return client.chat.completions.create(
    {
      model,
      messages: messages.slice(-AI_CHAT_LIMITS.maxHistoryMessages),
      stream: true,
      stream_options: { include_usage: true } as unknown as Record<string, unknown>,
      temperature: temperature ?? AI_DEFAULT_TEMPERATURE,
      max_tokens: clampMaxTokens(maxTokens, isTool),
    },
    { signal },
  );
}

interface WorkersAiRunResponse {
  result?: {
    data?: unknown;
    shape?: number[];
  };
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
}

export function createAIService(env: Env) {
  return {
    /**
     * Embeddings via Workers AI (bge-m3, WORKERS_AI_EMBEDDING_DIMS dims). Always
     * Workers AI, independent of configured chat provider.
     *
     * Uses native endpoint `/ai/run/@cf/baai/bge-m3` (not OpenAI-compatible
     * `/v1/embeddings`) because OpenAI-compatible currently returns a
     * 256-dim vector instead of documented 1024 dims, breaking
     * column `vector(1024)` in `ai_knowledge_chunk`. Native endpoint
     * honors true model dimensionality.
     */
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      if (!env.CLOUDFLARE_AI_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error('Workers AI no configurado: faltan credenciales de embedding');
      }
      // Cloudflare rejects empty inputs with 400. Filtering here avoids
      // failing whole document creation because of a blank chunk.
      const nonEmpty = texts.map((t) => t.trim()).filter((t) => t.length > 0);
      if (nonEmpty.length === 0) return [];
      const url = `${workersAiRunUrl(env.CLOUDFLARE_ACCOUNT_ID)}/${WORKERS_AI_EMBEDDING_MODEL}`;
      let res: WorkersAiRunResponse;
      try {
        res = await ofetch<WorkersAiRunResponse>(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.CLOUDFLARE_AI_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: { text: nonEmpty },
        });
      } catch (err) {
        const data = (err as { data?: unknown; statusCode?: number; message?: string }) ?? {};
        const status = data.statusCode ?? 0;
        const detail =
          typeof data.data === 'string'
            ? data.data
            : data.data
              ? JSON.stringify(data.data)
              : data.message ?? String(err);
        throw new Error(
          `Workers AI embedding error ${status} (${WORKERS_AI_EMBEDDING_MODEL}): ${detail}`,
        );
      }
      const raw = res?.result?.data;
      const vectors = extractEmbeddings(raw, nonEmpty.length);
      vectors.forEach((vec, i) => {
        if (vec.length !== WORKERS_AI_EMBEDDING_DIMS) {
          throw new Error(
            `Embedding dimensión inesperada (índice ${i}): ` +
            `recibido ${vec.length}, esperado ${WORKERS_AI_EMBEDDING_DIMS} ` +
            `(modelo ${WORKERS_AI_EMBEDDING_MODEL}). ` +
            'Si el modelo cambió de dimensión, actualiza WORKERS_AI_EMBEDDING_DIMS ' +
            'y la columna embedding de ai_knowledge_chunk.',
          );
        }
      });
      return vectors;
    },

    /**
     * Streams a chat completion token by token via the OpenAI SDK.
     * Accumulates usage if provider reports it (stream_options.include_usage).
     * Route must settle credits with usage.total_tokens.
     */
    streamChat(options: AiChatOptions): AiChatStream {
      const provider = getAiProvider(options.model);

      if (provider === 'openrouter') {
        return openRouterStream(createOpenRouterClient(env), options);
      }
      return workersAiStream(createWorkersAIClient(env), options);
    },
  };
}

/**
 * Normalizes Workers AI native endpoint response to `number[][]`.
 * The standard shape is `{ data: number[][] }` (batch x dims), but some
 * variants or models expose `number[]` when input is a single string.
 */
function extractEmbeddings(raw: unknown, expectedCount: number): number[][] {
  if (raw === undefined || raw === null) {
    throw new Error('Workers AI devolvió respuesta sin `result.data`');
  }
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return raw as number[][];
  }
  if (Array.isArray(raw) && raw.every((n) => typeof n === 'number')) {
    return [raw as number[]];
  }
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'data' in raw &&
    Array.isArray((raw as { data: unknown }).data)
  ) {
    return extractEmbeddings((raw as { data: unknown }).data, expectedCount);
  }
  if (expectedCount === 1 && Array.isArray(raw)) {
    return [raw as number[]];
  }
  throw new Error(
    `Workers AI devolvió un embedding con formato no reconocido: ${JSON.stringify(raw).slice(0, 200)}`,
  );
}

function workersAiStream(client: OpenAI, options: AiChatOptions): AiChatStream {
  let resolveModel!: (model: string) => void;
  let resolveUsage!: (u: AiChatUsage | null) => void;
  const model = new Promise<string>((resolve) => {
    resolveModel = resolve;
  });
  const usage = new Promise<AiChatUsage | null>((resolve) => {
    resolveUsage = resolve;
  });

  async function* stream(): AsyncGenerator<AiChatDelta, void, void> {
    resolveModel(options.model);
    let lastUsage: AiChatUsage | null = null;
    try {
      const completion = await buildChatBody(client, options);
      for await (const chunk of completion as AsyncIterable<{
        choices: { delta?: { content?: string } }[];
        usage?: AiChatUsage;
      }>) {
        const u = (chunk as { usage?: AiChatUsage }).usage;
        if (u) lastUsage = u;
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield { content };
      }
    } finally {
      resolveUsage(lastUsage);
    }
  }

  return { stream: stream(), model, usage };
}

function openRouterStream(client: OpenAI, options: AiChatOptions): AiChatStream {
  let resolveModel!: (model: string) => void;
  let resolveUsage!: (u: AiChatUsage | null) => void;
  const model = new Promise<string>((resolve) => {
    resolveModel = resolve;
  });
  const usage = new Promise<AiChatUsage | null>((resolve) => {
    resolveUsage = resolve;
  });

  async function* stream(): AsyncGenerator<AiChatDelta, void, void> {
    let modelResolved = false;
    let lastUsage: AiChatUsage | null = null;
    try {
      const completion = await buildChatBody(client, options);
      for await (const chunk of completion as AsyncIterable<{
        choices: { delta?: { content?: string } }[];
        model?: string;
        usage?: AiChatUsage;
      }>) {
        const u = (chunk as { usage?: AiChatUsage }).usage;
        if (u) lastUsage = u;
        if (!modelResolved) {
          modelResolved = true;
          resolveModel((chunk as { model?: string }).model ?? options.model);
        }
        const content = chunk.choices[0]?.delta?.content;
        if (content) yield { content };
      }
    } finally {
      if (!modelResolved) resolveModel(options.model);
      resolveUsage(lastUsage);
    }
  }

  return { stream: stream(), model, usage };
}

export type AIService = ReturnType<typeof createAIService>;
