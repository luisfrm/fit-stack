import { createOpenRouterClient, createWorkersAIClient } from '../lib/ai';
import type { Env } from '../lib/env';
import { getAiProvider, type IAiChatMessage } from '@workspace/shared';
import type OpenAI from 'openai';

export const AI_DEFAULT_MAX_TOKENS = 1024;
export const AI_DEFAULT_TEMPERATURE = 0.7;
export const AI_MAX_MESSAGES = 50;

export interface AiChatOptions {
  model: string;
  messages: IAiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AiChatDelta {
  content: string;
}

export interface AiChatStream {
  stream: AsyncGenerator<AiChatDelta, void, void>;
  /** Resolves to the actual model that answered (before the first delta). */
  model: Promise<string>;
}

function buildChatBody(
  client: OpenAI,
  { model, messages, temperature, maxTokens, signal }: AiChatOptions,
) {
  return client.chat.completions.create(
    {
      model,
      messages: messages.slice(-AI_MAX_MESSAGES),
      stream: true,
      temperature: temperature ?? AI_DEFAULT_TEMPERATURE,
      max_tokens: maxTokens ?? AI_DEFAULT_MAX_TOKENS,
    },
    { signal },
  );
}

export function createAIService(env: Env) {
  return {
    /**
     * Streams a chat completion token by token via the OpenAI SDK.
     * The provider is inferred from the model id (single source of truth in
     * @workspace/shared):
     *
     * - "workers-ai" → Cloudflare Workers AI, direct streaming.
     * - "openrouter" → `openrouter/free`: the automatic free router. OpenRouter
     *   itself picks the best available free model and falls back between them
     *   when a free quota is exhausted; the concrete model used comes in
     *   `chunk.model` and is exposed through the `model` promise.
     *
     * Yields only text deltas; the route owns the SSE envelope.
     * `signal` cancels the upstream subrequest when the client disconnects.
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
  const model = new Promise<string>((resolve) => {
    resolveModel = resolve;
  });

  async function* stream(): AsyncGenerator<AiChatDelta, void, void> {
    resolveModel(options.model);
    const completion = await buildChatBody(client, options);
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { content };
      }
    }
  }

  return { stream: stream(), model };
}

function openRouterStream(client: OpenAI, options: AiChatOptions): AiChatStream {
  let resolveModel!: (model: string) => void;
  const model = new Promise<string>((resolve) => {
    resolveModel = resolve;
  });

  async function* stream(): AsyncGenerator<AiChatDelta, void, void> {
    const completion = await buildChatBody(client, options);
    let modelResolved = false;
    for await (const chunk of completion) {
      if (!modelResolved) {
        modelResolved = true;
        resolveModel(chunk.model ?? options.model);
      }
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { content };
      }
    }
  }

  return { stream: stream(), model };
}

export type AIService = ReturnType<typeof createAIService>;
