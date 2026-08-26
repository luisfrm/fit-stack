import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireFeature } from '../lib/route-handler';
import {
  PERMISSION_MODULES as PM,
  PERMISSION_ACTIONS as PA,
  AI_MODELS,
  AI_CHAT_LIMITS,
  estimateCreditsFromMessages,
  creditsFromUsage,
  CHAT_MAX_CONVERSATIONS,
  CHAT_MAX_STORED,
} from '@workspace/shared';
import { createAIService } from '../services/ai.service';
import { createKnowledgeService } from '../services/knowledge.service';
import { createKnowledgeRepository } from '../repositories/knowledge.repository';
import { createFeaturesService } from '../services/features.service';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createCache } from '../lib/cache';
import { createChatRepository } from '../repositories/chat.repository';
import {
  resolveProviderChain,
  assembleRagPrompt,
  settleUsage,
  toSSEStream,
  type AiStreamDelta,
} from '../lib/ai-helpers';
import type { AppEnv } from '../lib/env';

// ── Zod schemas ──

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(AI_CHAT_LIMITS.maxHistoryMessageChars),
});

const chatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(AI_CHAT_LIMITS.maxMessages),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(AI_CHAT_LIMITS.maxToolOutputTokens).optional(),
});

const chatConversationSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  modelUsed: z.string().optional(),
  messages: z.array(chatMessageSchema).max(CHAT_MAX_STORED * 2),
  updatedAt: z.string().optional(),
});

const chatHistorySchema = z.object({
  conversations: z.array(chatConversationSchema).max(CHAT_MAX_CONVERSATIONS),
});

// ── Routes ──

export const aiRoutes = new Hono<AppEnv>()
  .get('/models', requireOrgPermission(PM.AI, PA.READ), (c) => {
    return c.json({ data: AI_MODELS });
  })

  // ── Historial de chat (Redis, sin DB) — cap CHAT_MAX_STORED por conversación ──
  .get('/conversations', requireOrgPermission(PM.AI, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const userId = c.get('user')!.id;
    const repo = createChatRepository(c.env);
    const data = await repo.list(orgId, userId);
    return c.json({ data });
  })

  .put('/conversations', requireOrgPermission(PM.AI, PA.READ), zValidator('json', chatHistorySchema), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const userId = c.get('user')!.id;
    const { conversations } = c.req.valid('json');
    const repo = createChatRepository(c.env);
    await repo.save(orgId, userId, conversations as never);
    return c.json({ success: true });
  })

  .delete('/conversations/:id', requireOrgPermission(PM.AI, PA.READ), async (c) => {
    const orgId = c.get('session')!.activeOrganizationId!;
    const userId = c.get('user')!.id;
    const id = c.req.param('id');
    const repo = createChatRepository(c.env);
    await repo.delete(orgId, userId, id);
    return c.json({ success: true });
  })

  // ── Chat streaming (SSE) ──
  .post(
    '/chat',
    requireOrgPermission(PM.AI, PA.READ),
    requireFeature('ai_chat'),
    zValidator('json', chatSchema),
    async (c) => {
      const body = c.req.valid('json');
      const { messages, temperature, maxTokens } = body;

      // 1. Validación de límites de input
      for (const m of messages) {
        const cap =
          m.role === 'user' ? AI_CHAT_LIMITS.maxUserMessageChars : AI_CHAT_LIMITS.maxHistoryMessageChars;
        if (m.content.length > cap) {
          return c.json({ error: `Mensaje excede ${cap} caracteres` }, 400);
        }
      }
      const totalInputChars = messages.reduce((a, m) => a + m.content.length, 0);
      if (totalInputChars > AI_CHAT_LIMITS.maxInputChars) {
        return c.json({ error: `Input excede ${AI_CHAT_LIMITS.maxInputChars} caracteres` }, 400);
      }

      // 2. Provider chain (Redis cache + settings)
      const cache = createCache(c.env);
      const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
      const { chain, workersReady, openRouterReady } = await resolveProviderChain(
        c.env,
        cache,
        platformSettingsRepo,
      );

      const hasReadyModel = chain.some((mdl) =>
        mdl.startsWith('@cf/') ? workersReady : openRouterReady,
      );
      if (!hasReadyModel) {
        return c.json(
          { error: 'IA no configurada: faltan credenciales de ambos providers' },
          503,
        );
      }

      // 3. Features + crédito pre-flight
      const orgId = c.get('session')!.activeOrganizationId!;
      const featuresService = createFeaturesService(
        createPlatformSubscriptionsRepository(c.get('db')),
        createPlatformPlansRepository(c.get('db')),
        platformSettingsRepo,
        createFeaturesRepository(c.get('db')),
        cache,
      );
      const aiService = createAIService(c.env);

      // 4. RAG prompt assembly
      const knowledgeService = createKnowledgeService(
        createKnowledgeRepository(c.get('db')),
        aiService,
      );
      const { finalMessages, ragExtraChars, systemPromptLength } = await assembleRagPrompt(
        knowledgeService,
        messages,
        orgId,
      );

      const estimated = estimateCreditsFromMessages(
        messages,
        maxTokens ?? AI_CHAT_LIMITS.maxOutputTokens,
        systemPromptLength + ragExtraChars,
      );
      const { allowed, quota } = await featuresService.consumeAiCredits(orgId, estimated);

      const quotaHeaders = {
        'X-Ai-Credits-Used': String(quota.monthly.used),
        'X-Ai-Credits-Limit': String(quota.monthly.limit),
        'X-Ai-Credits-Remaining': quota.remaining === null ? '' : String(quota.remaining),
      };

      if (!allowed) {
        return c.json(
          { error: 'Créditos IA agotados para este ciclo', code: 'AI_QUOTA_EXCEEDED', limits: quota },
          429,
          quotaHeaders,
        );
      }

      // 5. Stream creation with fallback chain
      const readyChain = chain.filter((mdl) =>
        mdl.startsWith('@cf/') ? workersReady : openRouterReady,
      );
      const periodStart = quota.periodStart;

      const makeStream = (mdl: string) => {
        const s = aiService.streamChat({
          model: mdl,
          messages: finalMessages,
          temperature,
          maxTokens,
          signal: c.req.raw.signal,
        });
        return { stream: s.stream, modelPromise: s.model, usage: s.usage, mdl };
      };

      const first = makeStream(readyChain[0]!);
      const fallbackStreams =
        readyChain.length > 1 ? readyChain.slice(1).map(makeStream) : null;

      let active = first;
      let usageEmitted = false;

      const wrappedStream: AsyncGenerator<AiStreamDelta, void, void> = (async function* () {
        let attemptIdx = 0;
        try {
          // Fallback chain: stream from active model, catch → next model
          let started = false;
          while (true) {
            try {
              for await (const delta of active.stream) {
                if (!started && delta.content) started = true;
                yield delta as AiStreamDelta;
              }
              break;
            } catch (err) {
              if (!started && fallbackStreams && attemptIdx < fallbackStreams.length) {
                active = fallbackStreams[attemptIdx++]!;
                continue;
              }
              throw err;
            }
          }

          // Success: settle credits synchronously and emit usage via SSE
          const usagePayload = await settleUsage(
            featuresService,
            active,
            orgId,
            periodStart,
            estimated,
          );
          if (usagePayload) {
            yield usagePayload;
            usageEmitted = true;
          }
        } finally {
          if (!usageEmitted) {
            // Fallback: settle async via waitUntil if SSE emission failed
            const p = active.usage
              .then((u) => {
                const actual = u ? creditsFromUsage(u) : estimated;
                return featuresService.settleAiCredits(orgId, periodStart, actual);
              })
              .catch(() => featuresService.settleAiCredits(orgId, periodStart, estimated).catch(() => {}))
              .catch(() => {});
            c.executionCtx.waitUntil(p as Promise<unknown>);
          }
        }
      })();

      // 6. Resolve model name (may come from fallback)
      const resolvedModelPromise = (async () => {
        try {
          return await active.modelPromise;
        } catch {
          return readyChain[0]!;
        }
      })();

      return new Response(toSSEStream(wrappedStream, resolvedModelPromise) as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...quotaHeaders,
        },
      });
    },
  );
