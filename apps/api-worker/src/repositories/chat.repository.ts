import { Redis } from '@upstash/redis';
import { CHAT_MAX_CONVERSATIONS, CHAT_MAX_STORED } from '@workspace/shared';
import type { Env } from '../lib/env';
import type { IAiChatMessage } from '@workspace/shared';

export interface ChatConversation {
  id: string;
  title: string;
  modelUsed?: string;
  messages: IAiChatMessage[];
  updatedAt?: string;
}

function chatKey(orgId: string, userId: string): string {
  return `chat:history:${orgId}:${userId}`;
}

export function createChatRepository(env: Partial<Env>) {
  const isConfigured = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  const redis = isConfigured
    ? new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! })
    : null;

  return {
    chatKey,

    async list(orgId: string, userId: string): Promise<ChatConversation[]> {
      if (!redis) return [];
      try {
        const raw = await redis.get<ChatConversation[]>(chatKey(orgId, userId));
        if (!raw) return [];
        // Upstash puede devolver string si se guardó como JSON; manejar ambos
        const parsed = typeof raw === 'string' ? (JSON.parse(raw) as ChatConversation[]) : raw;
        if (!Array.isArray(parsed)) return [];
        return parsed;
      } catch (e) {
        console.error('[chat redis] list error', e);
        return [];
      }
    },

    async save(orgId: string, userId: string, conversations: ChatConversation[]): Promise<void> {
      if (!redis) return;
      try {
        // Cap: 10 mensajes por conversación + 20 conversaciones
        const trimmed = conversations.slice(-CHAT_MAX_CONVERSATIONS).map((c) => ({
          ...c,
          messages: c.messages.slice(-CHAT_MAX_STORED),
          updatedAt: new Date().toISOString(),
        }));
        // Sin TTL (persistencia); Upstash set sin ex
        await redis.set(chatKey(orgId, userId), trimmed as unknown as string);
      } catch (e) {
        console.error('[chat redis] save error', e);
      }
    },

    async saveOne(orgId: string, userId: string, conversation: ChatConversation): Promise<void> {
      if (!redis) return;
      try {
        const trimmedConv: ChatConversation = {
          ...conversation,
          messages: conversation.messages.slice(-CHAT_MAX_STORED),
          updatedAt: new Date().toISOString(),
        };
        const raw = await redis.get<ChatConversation[]>(chatKey(orgId, userId));
        const existing: ChatConversation[] = (() => {
          if (!raw) return [];
          const parsed = typeof raw === 'string' ? (JSON.parse(raw as unknown as string) as ChatConversation[]) : raw;
          return Array.isArray(parsed) ? parsed : [];
        })();
        const idx = existing.findIndex((c) => c.id === trimmedConv.id);
        const next =
          idx >= 0
            ? existing.map((c, i) => (i === idx ? trimmedConv : c))
            : [...existing, trimmedConv].slice(-CHAT_MAX_CONVERSATIONS);
        await redis.set(chatKey(orgId, userId), next as unknown as string);
      } catch (e) {
        console.error('[chat redis] saveOne error', e);
      }
    },

    async delete(orgId: string, userId: string, conversationId: string): Promise<void> {
      if (!redis) return;
      try {
        const all = await redis.get<ChatConversation[]>(chatKey(orgId, userId));
        if (!all) return;
        const parsed = typeof all === 'string' ? (JSON.parse(all as unknown as string) as ChatConversation[]) : all;
        if (!Array.isArray(parsed)) return;
        const filtered = parsed.filter((c) => c.id !== conversationId);
        await redis.set(chatKey(orgId, userId), filtered as unknown as string);
      } catch (e) {
        console.error('[chat redis] delete error', e);
      }
    },
  };
}

export type ChatRepository = ReturnType<typeof createChatRepository>;
