import { createOpenRouterClient, createWorkersAIClient } from '../lib/ai';
import type { Env } from '../lib/env';
import {
  AI_CHAT_LIMITS,
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

export function createAIService(env: Env) {
  return {
    /**
     * Embeddings vía Workers AI (bge-m3, 1024 dims). Siempre Workers AI,
     * independiente del provider de chat configurado.
     */
    async embed(texts: string[]): Promise<number[][]> {
      if (!env.CLOUDFLARE_AI_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error('Workers AI no configurado: faltan credenciales de embedding');
      }
      const client = createWorkersAIClient(env);
      const res = await client.embeddings.create({
        model: WORKERS_AI_EMBEDDING_MODEL,
        input: texts,
      });
      return res.data.map((d) => d.embedding as number[]);
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
    const completion = await buildChatBody(client, options);
    let lastUsage: AiChatUsage | null = null;
    for await (const chunk of completion as AsyncIterable<{
      choices: { delta?: { content?: string } }[];
      usage?: AiChatUsage;
    }>) {
      const u = (chunk as { usage?: AiChatUsage }).usage;
      if (u) lastUsage = u;
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield { content };
    }
    resolveUsage(lastUsage);
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
    const completion = await buildChatBody(client, options);
    let modelResolved = false;
    let lastUsage: AiChatUsage | null = null;
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
    resolveUsage(lastUsage);
  }

  return { stream: stream(), model, usage };
}

export type AIService = ReturnType<typeof createAIService>;
