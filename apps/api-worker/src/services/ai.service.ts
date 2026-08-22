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
  creditsFromUsage,
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
  /** Si es tool, permite maxToolOutputTokens. */
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
  /** Resolves to usage del provider (si reporta include_usage). */
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
  ) as unknown as AsyncIterable<Record<string, unknown>>;
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
     * Embeddings vía Workers AI (bge-m3, WORKERS_AI_EMBEDDING_DIMS dims). Siempre
     * Workers AI, independiente del provider de chat configurado.
     *
     * Usa el endpoint nativo `/ai/run/@cf/baai/bge-m3` (no el OpenAI-compatible
     * `/v1/embeddings`) porque el OpenAI-compatible actualmente devuelve un
     * vector de 256 dims en lugar de los 1024 documentados, lo que rompe la
     * columna `vector(1024)` de `ai_knowledge_chunk`. El endpoint nativo
     * respeta la dimensión real del modelo.
     */
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      if (!env.CLOUDFLARE_AI_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error('Workers AI no configurado: faltan credenciales de embedding');
      }
      // Cloudflare rechaza inputs vacíos con 400. Filtrarlos aquí evita un
      // fallo de toda la creación de un documento por un chunk en blanco.
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
     * Acumula usage si el provider lo reporta (stream_options.include_usage).
     * El route debe settlementar créditos con usage.total_tokens.
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
 * Normaliza la respuesta del endpoint nativo de Workers AI a un `number[][]`.
 * El shape habitual es `{ data: number[][] }` (batch x dims), pero algunas
 * variantes o modelos exponen un `number[]` cuando el input es un único string.
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
