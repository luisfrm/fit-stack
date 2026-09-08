import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireFeature } from '../lib/route-handler';
import {
  PERMISSION_MODULES as PM,
  PERMISSION_ACTIONS as PA,
  AI_MODELS,
  AI_CHAT_LIMITS,
  RAG_CONFIG,
  estimateCreditsFromMessages,
  creditsFromUsage,
  CHAT_MAX_STORED,
  PANEL_SYSTEM_PROMPT,
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
import { createChatRepository, type ChatConversation } from '../repositories/chat.repository';
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

// ── Routes ──

export const aiRoutes = new Hono<AppEnv>()
  .get('/models', requireOrgPermission(PM.AI, PA.READ), (c) => {
    return c.json({ data: AI_MODELS });
  })

  // ── Historial de chat (Redis, sin DB) — cap CHAT_MAX_STORED por conversación ──
  .get('/conversations', requireOrgPermission(PM.AI, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
    const userId = c.get('user')!.id;
    const repo = createChatRepository(c.env);
    const data = await repo.list(orgId, userId);
    return c.json({ data });
  })

  .put('/conversations/:id', requireOrgPermission(PM.AI, PA.READ), zValidator('json', chatConversationSchema), async (c) => {
    const orgId = c.get('orgId')!;
    const userId = c.get('user')!.id;
    const body = c.req.valid('json');
    const repo = createChatRepository(c.env);
    const conversation: ChatConversation = {
      id: c.req.param('id'),
      title: body.title,
      modelUsed: body.modelUsed,
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      updatedAt: body.updatedAt,
    };
    // Valida que el id de la ruta coincida con el del body si viene
    if (body.id !== conversation.id) {
      return c.json({ error: 'ID de conversación no coincide' }, 400);
    }
    await repo.saveOne(orgId, userId, conversation);
    return c.json({ success: true });
  })

  .delete('/conversations/:id', requireOrgPermission(PM.AI, PA.READ), async (c) => {
    const orgId = c.get('orgId')!;
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

      // 3. Features + cuota pre-flight — ANTES del RAG: no gastar embeddings +
      // pgvector si la cuota ya está agotada. consumeAiCredits no reserva nada;
      // el estimate sin chars del RAG se corrige en el settle con el usage real.
      const orgId = c.get('orgId')!;
      const featuresService = createFeaturesService(
        createPlatformSubscriptionsRepository(c.get('db')),
        createPlatformPlansRepository(c.get('db')),
        platformSettingsRepo,
        createFeaturesRepository(c.get('db')),
        cache,
      );
      const aiService = createAIService(c.env);

      // Incluye cota superior del RAG (maxContextChars) para que el pre-flight nunca subestime
      const estimated = estimateCreditsFromMessages(
        messages.slice(-(AI_CHAT_LIMITS.maxHistoryMessages - 1)),
        maxTokens ?? AI_CHAT_LIMITS.maxOutputTokens,
        PANEL_SYSTEM_PROMPT.length + RAG_CONFIG.maxContextChars,
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

      // 4. RAG prompt assembly (solo si hay cuota)
      const knowledgeService = createKnowledgeService(
        createKnowledgeRepository(c.get('db')),
        aiService,
      );
      const { finalMessages } = await assembleRagPrompt(
        knowledgeService,
        messages,
        orgId,
      );

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

      // Model name: se resuelve con el PRIMER evento del stream ganador (post
      // fallback) y no al crear la response — evita reportar el modelo que
      // falló pre-start.
      let resolveModelName!: (model: string) => void;
      const modelNamePromise = new Promise<string>((resolve) => {
        resolveModelName = resolve;
      });
      // Idempotent: resolves the model-name promise only on the first call.
      let modelNameEmitted = false;
      const emitModelName = () => {
        if (modelNameEmitted) return;
        modelNameEmitted = true;
        active.modelPromise.then(resolveModelName).catch(() => resolveModelName(readyChain[0]!));
      };

      // Streams from the active model; on error before first content, falls
      // through to the next entry in the fallback chain.
      async function* streamWithFallback(): AsyncGenerator<AiStreamDelta, void, void> {
        let attemptIdx = 0;
        let started = false;
        while (true) {
          try {
            for await (const delta of active.stream) {
              emitModelName(); // no-op after first delta
              if (delta.content) started = true;
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
        // Covers zero-delta streams: no-op if already emitted
        emitModelName();
      }

      // Schedules an async credit settlement via waitUntil when SSE emission failed.
      function scheduleAsyncSettle(): void {
        const p = active.usage
          .then((u) => {
            const actual = u ? creditsFromUsage(u) : estimated;
            return featuresService.settleAiCredits(orgId, periodStart, actual);
          })
          .catch(() => featuresService.settleAiCredits(orgId, periodStart, estimated).catch(() => {}))
          .catch(() => {});
        c.executionCtx.waitUntil(p as Promise<unknown>);
      }

      const wrappedStream: AsyncGenerator<AiStreamDelta, void, void> = (async function* () {
        try {
          // Fallback chain: stream from active model, catch → next model
          yield* streamWithFallback();

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
          // Fallback: settle async via waitUntil if SSE emission failed
          if (!usageEmitted) scheduleAsyncSettle();
        }
      })();

      // 6. Resolve model name (may come from fallback) — ya emitido por el stream ganador
      return new Response(toSSEStream(wrappedStream, modelNamePromise) as unknown as BodyInit, {
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
