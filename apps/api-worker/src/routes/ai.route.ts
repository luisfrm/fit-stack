import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireFeature } from '../lib/route-handler';
import {
  PERMISSION_MODULES as PM,
  PERMISSION_ACTIONS as PA,
  AI_MODELS,
  AI_CHAT_LIMITS,
  PANEL_SYSTEM_PROMPT,
  creditsFromUsage,
  estimateCreditsFromMessages,
  getOrderedModelChain,
  type AiProviderId,
} from '@workspace/shared';
import { createAIService } from '../services/ai.service';
import { createKnowledgeService } from '../services/knowledge.service';
import { createKnowledgeRepository } from '../repositories/knowledge.repository';
import { createFeaturesService, AI_PROVIDER_DEFAULT_KEY } from '../services/features.service';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(AI_CHAT_LIMITS.maxHistoryMessageChars),
});

const chatSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(AI_CHAT_LIMITS.maxMessages),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(AI_CHAT_LIMITS.maxToolOutputTokens).optional(),
});

const encoder = new TextEncoder();

function toSSEStream(
  deltas: AsyncIterable<{ content: string }>,
  modelPromise: Promise<string>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const send = (event: import('@workspace/shared').IAiSseEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        let modelEmitted = false;
        for await (const delta of deltas) {
          if (!modelEmitted) {
            modelEmitted = true;
            send({ model: await modelPromise });
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

export const aiRoutes = new Hono<AppEnv>()
  .get('/models', requireOrgPermission(PM.AI, PA.READ), (c) => {
    return c.json({ data: AI_MODELS });
  })

  .post(
    '/chat',
    requireOrgPermission(PM.AI, PA.READ),
    requireFeature('ai_chat'),
    zValidator('json', chatSchema),
    async (c) => {
      const body = c.req.valid('json');
      const { messages, temperature, maxTokens } = body;

      // Límites de balance (constantes, no hardcode)
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

      // Provider default desde settings (cacheado en Redis + tag)
      const cache = createCache(c.env);
      const platformSettingsRepo = createPlatformSettingsRepository(c.get('db'));
      const cacheKey = 'ai:provider:default';
      let configured = (await cache.get<string>(cacheKey)) as string | null;
      if (configured === null || configured === undefined) {
        configured = (await platformSettingsRepo.findByKey(AI_PROVIDER_DEFAULT_KEY)) ?? null;
        if (configured) await cache.set(cacheKey, configured, 300);
      }
      const chain = getOrderedModelChain(configured);

      // Validación: al menos un provider de la cadena debe estar configurado
      const workersReady = !!c.env.CLOUDFLARE_AI_API_TOKEN && !!c.env.CLOUDFLARE_ACCOUNT_ID;
      const openRouterReady = !!c.env.OPENROUTER_API_KEY;
      const hasReadyModel = chain.some((mdl) =>
        mdl.startsWith('@cf/') ? workersReady : openRouterReady,
      );
      if (!hasReadyModel) {
        return c.json(
          { error: 'IA no configurada: faltan credenciales de ambos providers' },
          503,
        );
      }

      const orgId = c.get('session')!.activeOrganizationId!;
      const featuresService = createFeaturesService(
        createPlatformSubscriptionsRepository(c.get('db')),
        createPlatformPlansRepository(c.get('db')),
        platformSettingsRepo,
        createFeaturesRepository(c.get('db')),
        cache,
      );

      const estimated = estimateCreditsFromMessages(
        messages,
        maxTokens ?? AI_CHAT_LIMITS.maxOutputTokens,
        PANEL_SYSTEM_PROMPT.length + 12,
      );
      const { allowed, quota } = await featuresService.consumeAiCredits(orgId, estimated);

      const quotaHeaders = {
        'X-Ai-Credits-Used': String(quota.monthly.used),
        'X-Ai-Credits-Limit': String(quota.monthly.limit),
        'X-Ai-Credits-Remaining': quota.remaining === null ? '' : String(quota.remaining),
      };

      if (!allowed) {
        return c.json(
          {
            error: 'Créditos IA agotados para este ciclo',
            code: 'AI_QUOTA_EXCEEDED',
            limits: quota,
          },
          429,
          quotaHeaders,
        );
      }

      const periodStart = quota.periodStart;
      const aiService = createAIService(c.env);

      const knowledgeService = createKnowledgeService(
        createKnowledgeRepository(c.get('db')),
        aiService,
      );
      const lastUser = [...messages].reverse().find((m) => m.role === 'user');
      const ragContext = lastUser
        ? await knowledgeService.searchForChat(lastUser.content, orgId)
        : '';
      const systemPrompt = ragContext
        ? `${PANEL_SYSTEM_PROMPT}\n\n[Contexto]\n${ragContext}`
        : PANEL_SYSTEM_PROMPT;
      const finalMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages,
      ];

      // Filtra la cadena a modelos con credenciales disponibles
      const readyChain = chain.filter((mdl) =>
        mdl.startsWith('@cf/') ? workersReady : openRouterReady,
      );

      // Si solo queda un modelo, stream directo; si hay varios, fallback en el primer chunk
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
      let fallbackStreams: ReturnType<typeof makeStream>[] | null =
        readyChain.length > 1 ? readyChain.slice(1).map(makeStream) : null;

      let active = first;
      const wrappedStream = (async function* () {
        let done = false;
        let attemptIdx = 0;
        try {
          let started = false;
          while (true) {
            try {
              for await (const delta of active.stream) {
                if (!started && delta.content) started = true;
                yield delta;
              }
              done = true;
              break;
            } catch (err) {
              if (!started && fallbackStreams && attemptIdx < fallbackStreams.length) {
                active = fallbackStreams[attemptIdx++]!;
                continue;
              }
              throw err;
            }
          }
        } finally {
          const p = active.usage
            .then((u) => {
              const actual = u ? creditsFromUsage(u) : estimated;
              return featuresService.settleAiCredits(orgId, periodStart, actual);
            })
            .catch(() => {});
          c.executionCtx.waitUntil(p);
          if (!done) {
            c.executionCtx.waitUntil(
              featuresService.settleAiCredits(orgId, periodStart, estimated).catch(() => {}),
            );
          }
        }
      })();

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
