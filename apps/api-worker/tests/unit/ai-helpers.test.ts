/**
 * Unit tests for lib/ai-helpers.ts
 *
 * Pure functions with dependency injection — no DB, no HTTP, no Redis.
 * Mocks are minimal inline objects matching the expected interfaces.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  resolveProviderChain,
  assembleRagPrompt,
  settleUsage,
  toSSEStream,
  type AiStreamDelta,
} from '../../src/lib/ai-helpers';
import { PANEL_SYSTEM_PROMPT, AI_CHAT_LIMITS } from '@workspace/shared';

// ── Helpers ──

function mockCache(store: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    set: vi.fn(async () => {}),
    invalidate: vi.fn(async () => {}),
    invalidateExact: vi.fn(async () => {}),
    increment: vi.fn(async () => null),
  };
}

function mockSettingsRepo(value: string | null) {
  return {
    findByKey: vi.fn(async () => value),
    // Unused methods — cast to satisfy the type
    findAll: vi.fn(async () => []),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  } as any;
}

function mockKnowledgeService(ragContext: string = '') {
  return {
    searchForChat: vi.fn(async () => ragContext),
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as any;
}

function mockFeaturesService(settledQuota?: {
  monthly: { used: number; limit: number };
  remaining: number | null;
  periodStart: Date;
}) {
  const defaultQuota = settledQuota ?? {
    monthly: { used: 10, limit: 100 },
    remaining: 90,
    periodStart: new Date('2026-01-01T00:00:00Z'),
  };
  return {
    settleAiCredits: vi.fn(async () => ({
      ...defaultQuota,
      disabled: false,
    })),
    consumeAiCredits: vi.fn(),
    getAiQuota: vi.fn(),
    getOrgFeatures: vi.fn(),
    getSeatsUsage: vi.fn(),
    getCreditPeriodStart: vi.fn(),
  } as any;
}

// ── Tests ──

describe('resolveProviderChain', () => {
  it('returns chain from cache when available', async () => {
    const cache = mockCache({ 'ai:provider:default': 'workers-ai' });
    const repo = mockSettingsRepo(null);

    const result = await resolveProviderChain(
      { CLOUDFLARE_AI_API_TOKEN: 'tok', CLOUDFLARE_ACCOUNT_ID: 'acc', OPENROUTER_API_KEY: 'or' },
      cache,
      repo,
    );

    expect(result.chain).toBeDefined();
    expect(result.chain.length).toBeGreaterThan(0);
    expect(result.workersReady).toBe(true);
    expect(result.openRouterReady).toBe(true);
    expect(repo.findByKey).not.toHaveBeenCalled(); // cache hit
  });

  it('falls back to settings repo on cache miss', async () => {
    const cache = mockCache();
    const repo = mockSettingsRepo('openrouter');

    const result = await resolveProviderChain(
      { OPENROUTER_API_KEY: 'or' },
      cache,
      repo,
    );

    expect(repo.findByKey).toHaveBeenCalledWith('ai_provider_default');
    expect(cache.set).toHaveBeenCalledWith('ai:provider:default', 'openrouter', 300);
    expect(result.chain).toBeDefined();
    expect(result.workersReady).toBe(false);
    expect(result.openRouterReady).toBe(true);
  });

  it('defaults to openrouter when no setting configured', async () => {
    const cache = mockCache();
    const repo = mockSettingsRepo(null);

    const result = await resolveProviderChain(
      { OPENROUTER_API_KEY: 'or-key' },
      cache,
      repo,
    );

    // Should not cache null
    expect(cache.set).not.toHaveBeenCalled();
    expect(result.chain).toBeDefined();
    expect(result.openRouterReady).toBe(true);
  });

  it('reports workersReady=false when credentials missing', async () => {
    const cache = mockCache({ 'ai:provider:default': 'workers-ai' });
    const repo = mockSettingsRepo(null);

    const result = await resolveProviderChain(
      { CLOUDFLARE_AI_API_TOKEN: undefined, CLOUDFLARE_ACCOUNT_ID: undefined },
      cache,
      repo,
    );

    expect(result.workersReady).toBe(false);
  });

  it('reports openRouterReady=false when key missing', async () => {
    const cache = mockCache({ 'ai:provider:default': 'openrouter' });
    const repo = mockSettingsRepo(null);

    const result = await resolveProviderChain(
      { OPENROUTER_API_KEY: undefined },
      cache,
      repo,
    );

    expect(result.openRouterReady).toBe(false);
  });
});

describe('assembleRagPrompt', () => {
  it('returns base system prompt when RAG context is empty', async () => {
    const ks = mockKnowledgeService('');

    const result = await assembleRagPrompt(
      ks,
      [{ role: 'user', content: '¿Qué es FitStack?' }],
      'org-1',
    );

    expect(ks.searchForChat).toHaveBeenCalledWith('¿Qué es FitStack?', 'org-1');
    expect(result.finalMessages).toHaveLength(2);
    expect(result.finalMessages[0]!.role).toBe('system');
    expect(result.finalMessages[0]!.content).toBe(PANEL_SYSTEM_PROMPT);
    expect(result.finalMessages[1]).toEqual({ role: 'user', content: '¿Qué es FitStack?' });
    expect(result.ragExtraChars).toBe(0);
    expect(result.systemPromptLength).toBe(PANEL_SYSTEM_PROMPT.length);
  });

  it('appends RAG context when found', async () => {
    const ragContext = 'FitStack cuesta $29/mes.';
    const ks = mockKnowledgeService(ragContext);

    const result = await assembleRagPrompt(
      ks,
      [{ role: 'user', content: '¿Cuánto cuesta?' }],
      'org-1',
    );

    expect(result.finalMessages[0]!.content).toContain('[Contexto]');
    expect(result.finalMessages[0]!.content).toContain(ragContext);
    expect(result.finalMessages).toHaveLength(2);
    expect(result.ragExtraChars).toBe(ragContext.length + 12);
    expect(result.systemPromptLength).toBe(result.finalMessages[0]!.content.length);
  });

  it('caps history to maxHistoryMessages - 1 preserving the system prompt', async () => {
    const ks = mockKnowledgeService('');
    const history = Array.from({ length: 6 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    })) as { role: 'user' | 'assistant'; content: string }[];

    const result = await assembleRagPrompt(ks, history, 'org-1');

    expect(result.finalMessages).toHaveLength(AI_CHAT_LIMITS.maxHistoryMessages);
    expect(result.finalMessages[0]!.role).toBe('system');
    expect(result.finalMessages[1]!.content).toBe('msg-1');
    expect(result.finalMessages!.at(-1)!.content).toBe('msg-5');
    expect(result.finalMessages.map((m) => m.content)).not.toContain('msg-0');
  });

  it('uses last user message for RAG query', async () => {
    const ks = mockKnowledgeService('context');

    await assembleRagPrompt(
      ks,
      [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'answer' },
        { role: 'user', content: 'second question' },
      ],
      'org-1',
    );

    expect(ks.searchForChat).toHaveBeenCalledWith('second question', 'org-1');
  });

  it('handles messages with no user message', async () => {
    const ks = mockKnowledgeService('');

    const result = await assembleRagPrompt(
      ks,
      [{ role: 'assistant', content: 'hi' }],
      'org-1',
    );

    expect(ks.searchForChat).not.toHaveBeenCalled();
    expect(result.ragExtraChars).toBe(0);
  });

  it('propagates searchForChat errors (caller knowledge.service handles)', async () => {
    const ks = mockKnowledgeService('');
    ks.searchForChat.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      assembleRagPrompt(ks, [{ role: 'user', content: 'test' }], 'org-1'),
    ).rejects.toThrow('DB down');
  });
});

describe('settleUsage', () => {
  const orgId = 'org-test';
  const periodStart = new Date('2026-03-01T00:00:00Z');

  it('returns usage payload on success', async () => {
    const fs = mockFeaturesService({
      monthly: { used: 15, limit: 100 },
      remaining: 85,
      periodStart,
    });
    const active = {
      usage: Promise.resolve({ prompt_tokens: 500, completion_tokens: 200, total_tokens: 700 }),
      mdl: 'test-model',
    };

    const result = await settleUsage(fs, active, orgId, periodStart, 2);

    expect(result).not.toBeNull();
    expect(result!.usage.monthly).toEqual({ used: 15, limit: 100 });
    expect(result!.usage.remaining).toBe(85);
    expect(result!.usage.periodStart).toBe(periodStart.toISOString());
    expect(fs.settleAiCredits).toHaveBeenCalledWith(orgId, periodStart, expect.any(Number));
  });

  it('uses estimated credits when provider returns null usage', async () => {
    const fs = mockFeaturesService({
      monthly: { used: 5, limit: 100 },
      remaining: 95,
      periodStart,
    });
    const active = {
      usage: Promise.resolve(null),
      mdl: 'test-model',
    };

    const result = await settleUsage(fs, active, orgId, periodStart, 3);

    expect(result).not.toBeNull();
    expect(fs.settleAiCredits).toHaveBeenCalledWith(orgId, periodStart, 3);
  });

  it('returns null when settleAiCredits throws', async () => {
    const fs = mockFeaturesService();
    fs.settleAiCredits.mockRejectedValueOnce(new Error('DB error'));
    const active = {
      usage: Promise.resolve({ total_tokens: 100 }),
      mdl: 'test-model',
    };

    const result = await settleUsage(fs, active, orgId, periodStart, 1);

    expect(result).toBeNull();
  });

  it('returns null when usage promise rejects', async () => {
    const fs = mockFeaturesService();
    const active = {
      usage: Promise.reject(new Error('stream interrupted')),
      mdl: 'test-model',
    };

    const result = await settleUsage(fs, active, orgId, periodStart, 2);

    expect(result).toBeNull();
  });
});

describe('toSSEStream', () => {
  function decodeStream(stream: ReadableStream<Uint8Array>): Promise<string[]> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const lines: string[] = [];

    return (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        lines.push(decoder.decode(value, { stream: true }));
      }
      return lines;
    })();
  }

  function parseSSE(raw: string): unknown[] {
    return raw
      .split('\n\n')
      .filter(Boolean)
      .map((block) => {
        const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
        if (!dataLine) return null;
        return JSON.parse(dataLine.slice(5).trim());
      })
      .filter(Boolean);
  }

  async function* makeDeltas(...items: AiStreamDelta[]): AsyncGenerator<AiStreamDelta> {
    for (const item of items) yield item;
  }

  it('emits model event before first content delta', async () => {
    const deltas = makeDeltas({ content: 'Hello' }, { content: ' world' });
    const stream = toSSEStream(deltas, Promise.resolve('gpt-4'));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    expect(events[0]).toEqual({ model: 'gpt-4' });
    expect(events[1]).toEqual({ content: 'Hello' });
    expect(events[2]).toEqual({ content: ' world' });
    expect(events[3]).toEqual({ done: true });
  });

  it('emits usage event when delta contains usage', async () => {
    const usagePayload = {
      monthly: { used: 10, limit: 100 },
      remaining: 90,
      periodStart: '2026-01-01T00:00:00.000Z',
    };
    const deltas = makeDeltas(
      { content: 'Hi' },
      { usage: usagePayload },
    );
    const stream = toSSEStream(deltas, Promise.resolve('model-a'));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    expect(events).toEqual([
      { model: 'model-a' },
      { content: 'Hi' },
      { usage: usagePayload },
      { done: true },
    ]);
  });

  it('emits error event when stream throws', async () => {
    async function* failingDeltas(): AsyncGenerator<AiStreamDelta> {
      yield { content: 'partial' };
      throw new Error('network timeout');
    }

    const stream = toSSEStream(failingDeltas(), Promise.resolve('model-x'));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    expect(events[0]).toEqual({ model: 'model-x' });
    expect(events[1]).toEqual({ content: 'partial' });
    expect(events[2]).toEqual({ error: 'network timeout' });
    // done is NOT emitted after error
    expect(events.find((e: any) => e?.done)).toBeUndefined();
  });

  it('emits error when model promise rejects before first delta', async () => {
    const deltas = makeDeltas({ content: 'test' });
    const stream = toSSEStream(deltas, Promise.reject(new Error('model fail')));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    // modelPromise rejects on first await → catch sends error + closes
    expect(events).toEqual([{ error: 'model fail' }]);
  });

  it('emits done after all deltas consumed', async () => {
    const deltas = makeDeltas({ content: 'a' }, { content: 'b' }, { content: 'c' });
    const stream = toSSEStream(deltas, Promise.resolve('m'));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    expect(events[events.length - 1]).toEqual({ done: true });
  });

  it('empty stream emits done only (model deferred until first delta)', async () => {
    const deltas = makeDeltas();
    const stream = toSSEStream(deltas, Promise.resolve('model-empty'));
    const raw = await decodeStream(stream);
    const events = raw.flatMap(parseSSE);

    // Model is only awaited when the first delta arrives; empty stream → no model event
    expect(events).toEqual([{ done: true }]);
  });
});
