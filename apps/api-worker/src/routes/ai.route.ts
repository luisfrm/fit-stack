import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireOrgPermission, requireFeature } from '../lib/route-handler';
import {
  PERMISSION_MODULES as PM,
  PERMISSION_ACTIONS as PA,
  AI_MODELS,
  ALL_CHAT_MODEL_IDS,
  getAiProvider,
  type IAiSseEvent,
} from '@workspace/shared';
import { createAIService, type AiChatDelta } from '../services/ai.service';
import { createFeaturesService } from '../services/features.service';
import { createFeaturesRepository } from '../repositories/features.repository';
import { createPlatformSubscriptionsRepository } from '../repositories/platform-subscriptions.repository';
import { createPlatformPlansRepository } from '../repositories/platform-plans.repository';
import { createPlatformSettingsRepository } from '../repositories/platform-settings.repository';
import { createCache } from '../lib/cache';
import type { AppEnv } from '../lib/env';

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(20_000),
});

const chatSchema = z.object({
  model: z.enum(ALL_CHAT_MODEL_IDS),
  messages: z.array(chatMessageSchema).min(1).max(50),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

const encoder = new TextEncoder();

/**
 * Converts an async iterable of text deltas into a server-sent events stream.
 * Contract (one JSON per `data:` line):
 *   {"model":"..."}      → actual model that answered (first event)
 *   {"content":"..."}    → text delta
 *   {"done":true}        → end of stream
 *   {"error":"..."}      → mid-stream error (stream is closed afterwards)
 */
function toSSEStream(
  deltas: AsyncIterable<AiChatDelta>,
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
  // GET /api/ai/models — allowlist of available models (drives the panel selector via RSC)
  .get('/models', requireOrgPermission(PM.AI, PA.READ), (c) => {
    return c.json({ data: AI_MODELS });
  })

  // POST /api/ai/chat — streaming chat completion (SSE)
  // Enforcement: feature `ai_chat` + rate-limit diario/semanal/mensual (fuente de verdad: Postgres ai_usage; Redis solo caché)
  .post(
    '/chat',
    requireOrgPermission(PM.AI, PA.READ),
    requireFeature('ai_chat'),
    zValidator('json', chatSchema),
    async (c) => {
      const { model, messages, temperature, maxTokens } = c.req.valid('json');
      const provider = getAiProvider(model);

      if (provider === 'openrouter' && !c.env.OPENROUTER_API_KEY) {
        return c.json({ error: 'IA no configurada: falta OPENROUTER_API_KEY' }, 503);
      }
      if (
        provider === 'workers-ai' &&
        (!c.env.CLOUDFLARE_AI_API_TOKEN || !c.env.CLOUDFLARE_ACCOUNT_ID)
      ) {
        return c.json({ error: 'IA no configurada: faltan variables de entorno de Workers AI' }, 503);
      }

      // Rate-limit: consume 1 mensaje (cuotas del plan; 0 = ilimitado)
      const orgId = c.get('session')!.activeOrganizationId!;
      const cache = createCache(c.env);
      const featuresService = createFeaturesService(
        createPlatformSubscriptionsRepository(c.get('db')),
        createPlatformPlansRepository(c.get('db')),
        createPlatformSettingsRepository(c.get('db')),
        createFeaturesRepository(c.get('db')),
        cache
      );
      const { allowed, quota } = await featuresService.consumeAiMessage(orgId);

      const quotaHeaders = {
        'X-Ai-Quota-Daily': `${quota.daily.used}/${quota.daily.limit === 0 ? '0' : quota.daily.limit}`,
        'X-Ai-Quota-Weekly': `${quota.weekly.used}/${quota.weekly.limit === 0 ? '0' : quota.weekly.limit}`,
        'X-Ai-Quota-Monthly': `${quota.monthly.used}/${quota.monthly.limit === 0 ? '0' : quota.monthly.limit}`,
      };

      if (!allowed) {
        return c.json(
          {
            error: 'Cuota de mensajes IA agotada para este período',
            code: 'AI_QUOTA_EXCEEDED',
            limits: quota,
          },
          429,
          quotaHeaders
        );
      }

      const aiService = createAIService(c.env);
      const { stream, model: modelPromise } = aiService.streamChat({
        model,
        messages,
        temperature,
        maxTokens,
        signal: c.req.raw.signal,
      });

      return new Response(toSSEStream(stream, modelPromise) as unknown as BodyInit, {
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
