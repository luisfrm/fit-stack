import OpenAI from 'openai';
import type { Env } from './env';

/**
 * OpenAI-compatible base URL for Cloudflare Workers AI.
 * The account id is part of the URL (not sensitive), the token is a secret.
 */
export const workersAiBaseUrl = (accountId: string): string =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * App identification headers required/recommended by OpenRouter
 * (not sensitive — safe as code constants).
 */
export const OPENROUTER_REFERER = 'https://fitstack-api.luisrivas.site';
export const OPENROUTER_APP_TITLE = 'Fit-Stack';

interface AIClientConfig {
  apiKey: string;
  baseURL: string;
  maxRetries?: number;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

/**
 * OpenAI SDK client factory. The model is NOT bound here — it's a per-call
 * string parameter (`client.chat.completions.create({ model, ... })`), so a
 * single client serves multiple chats with different models.
 */
function createAIClient({
  apiKey,
  baseURL,
  maxRetries = 2,
  timeout = 60_000,
  defaultHeaders,
}: AIClientConfig): OpenAI {
  return new OpenAI({ apiKey, baseURL, maxRetries, timeout, defaultHeaders });
}

/**
 * Client bound to Cloudflare Workers AI.
 * If `AI_GATEWAY_URL` is set (Cloudflare AI Gateway), it takes precedence
 * over the direct Workers AI endpoint.
 */
export function createWorkersAIClient(env: Env): OpenAI {
  return createAIClient({
    apiKey: env.CLOUDFLARE_API_TOKEN,
    baseURL: env.AI_GATEWAY_URL ?? workersAiBaseUrl(env.CLOUDFLARE_ACCOUNT_ID),
  });
}

/**
 * Client bound to OpenRouter.
 * `maxRetries: 0` so quota/rate-limit errors (429) surface immediately
 * instead of being retried by the SDK against the same exhausted model.
 */
export function createOpenRouterClient(env: Env): OpenAI {
  return createAIClient({
    apiKey: env.OPENROUTER_API_KEY ?? '',
    baseURL: OPENROUTER_BASE_URL,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': OPENROUTER_REFERER,
      'X-Title': OPENROUTER_APP_TITLE,
    },
  });
}
