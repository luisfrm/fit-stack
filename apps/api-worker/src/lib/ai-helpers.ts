/**
 * AI Chat helpers — extracted from ai.route.ts for testability and reuse.
 *
 * Each function is dependency-injected (no Hono context coupling).
 */

import {
  getOrderedModelChain,
  PANEL_SYSTEM_PROMPT,
  creditsFromUsage,
  AI_CHAT_LIMITS,
  type IAiChatMessage,
  type IAiSseEvent,
} from '@workspace/shared';
import { AI_PROVIDER_DEFAULT_KEY } from '../services/features.service';
import type { KnowledgeService } from '../services/knowledge.service';
import type { FeaturesService } from '../services/features.service';
import type { Cache } from './cache';
import type { PlatformSettingsRepository } from '../repositories/platform-settings.repository';

// ── Types ──

export type AiStreamDelta =
  | { content: string }
  | { usage: { monthly: { used: number; limit: number }; remaining: number | null; periodStart: string } };

export interface ProviderChain {
  chain: readonly string[];
  workersReady: boolean;
  openRouterReady: boolean;
}

export interface RagPromptResult {
  finalMessages: IAiChatMessage[];
  ragExtraChars: number;
  systemPromptLength: number;
}

// ── Provider resolution ──

/**
 * Resolves the ordered model chain from platform settings (cached in Redis).
 * Also reports which providers have credentials available.
 */
export async function resolveProviderChain(
  env: { CLOUDFLARE_AI_API_TOKEN?: string; CLOUDFLARE_ACCOUNT_ID?: string; OPENROUTER_API_KEY?: string },
  cache: Cache,
  platformSettingsRepo: PlatformSettingsRepository,
): Promise<ProviderChain> {
  const cacheKey = 'ai:provider:default';
  let configured = (await cache.get<string>(cacheKey)) as string | null;
  if (configured === null || configured === undefined) {
    configured = (await platformSettingsRepo.findByKey(AI_PROVIDER_DEFAULT_KEY)) ?? null;
    if (configured) await cache.set(cacheKey, configured, 300);
  }

  const chain = getOrderedModelChain(configured);
  const workersReady = !!env.CLOUDFLARE_AI_API_TOKEN && !!env.CLOUDFLARE_ACCOUNT_ID;
  const openRouterReady = !!env.OPENROUTER_API_KEY;

  return { chain, workersReady, openRouterReady };
}

// ── RAG prompt assembly ──

/**
 * Retrieves RAG context for the last user message and assembles the final
 * system prompt. Non-throwing: RAG failures return an empty context.
 */
export async function assembleRagPrompt(
  knowledgeService: KnowledgeService,
  messages: readonly IAiChatMessage[],
  orgId: string,
): Promise<RagPromptResult> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const ragContext = lastUser
    ? await knowledgeService.searchForChat(lastUser.content, orgId)
    : '';

  const systemPrompt = ragContext
    ? `${PANEL_SYSTEM_PROMPT}\n\n[Contexto]\n${ragContext}`
    : PANEL_SYSTEM_PROMPT;

  const finalMessages: IAiChatMessage[] = [
    { role: 'system' as const, content: systemPrompt },
    // Historial acotado a maxHistoryMessages - 1 para que el system prompt
    // nunca se pierda en el slice de buildChatBody (solo se envían estos).
    ...messages.slice(-(AI_CHAT_LIMITS.maxHistoryMessages - 1)),
  ];

  const ragExtraChars = ragContext ? ragContext.length + 12 : 0;

  return { finalMessages, ragExtraChars, systemPromptLength: systemPrompt.length };
}

// ── Usage settlement ──

/**
 * Settles AI credits post-stream and returns the payload for the SSE usage event.
 * Returns null if settlement fails (caller should fall back to waitUntil).
 */
export async function settleUsage(
  featuresService: FeaturesService,
  active: { usage: Promise<{ prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null>; mdl: string },
  orgId: string,
  periodStart: Date,
  estimated: number,
): Promise<AiStreamDelta | null> {
  try {
    const u = await active.usage;
    const actual = u ? creditsFromUsage(u) : estimated;
    const settled = await featuresService.settleAiCredits(orgId, periodStart, actual);
    return {
      usage: {
        monthly: settled.monthly,
        remaining: settled.remaining,
        periodStart: settled.periodStart.toISOString(),
      },
    };
  } catch {
    return null;
  }
}

// ── SSE stream construction ──

const encoder = new TextEncoder();

/**
 * Converts an AsyncGenerator<AiStreamDelta> into a ReadableStream<Uint8Array>
 * that formats SSE events (model, content, usage, done, error).
 */
export function toSSEStream(
  deltas: AsyncIterable<AiStreamDelta>,
  modelPromise: Promise<string>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (event: IAiSseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        let modelEmitted = false;
        for await (const delta of deltas) {
          if (!modelEmitted) {
            modelEmitted = true;
            send({ model: await modelPromise });
          }
          if ('usage' in delta) {
            send({ usage: delta.usage });
            continue;
          }
          send({ content: delta.content });
        }
        send({ done: true });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error en la generación de la respuesta';
        send({ error: message });
        controller.close();
      }
    },
  });
}
