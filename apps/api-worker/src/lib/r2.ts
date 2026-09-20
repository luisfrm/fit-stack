import type { Env } from './env';
import { isPublicStorageKey } from '@workspace/shared';

export function createR2Service(env: Env) {
  const bucket = env.FILES_BUCKET;

  return {
    /**
     * Generates a direct upload URL pointing at the `direct` endpoint of the
     * router that owns the key's scope. `uploadBaseUrl` is the base of that
     * router (p. ej. `…/api/upload`, `…/api/platform/organizations/<id>/upload`,
     * `…/api/platform/upload`).
     */
    async getUploadUrl(key: string, uploadBaseUrl: string) {
      const cleanBaseUrl = uploadBaseUrl.endsWith('/') ? uploadBaseUrl.slice(0, -1) : uploadBaseUrl;
      const presignedUrl = `${cleanBaseUrl}/direct?key=${encodeURIComponent(key)}`;
      return { presignedUrl, key };
    },

    /**
     * Lists files under a given prefix using native Cloudflare Workers R2 binding.
     */
    async listFiles(prefix: string) {
      if (!bucket) {
        throw new Error('FILES_BUCKET binding is missing');
      }

      const publicDomain = env.R2_PUBLIC_URL || 'http://localhost:8788/api/public/files';
      const listed = await bucket.list({ prefix });

      return (listed.objects || []).map((object) => {
        const keyParts = object.key.split('/');
        const filename = keyParts.at(-1) || object.key;
        return {
          key: object.key,
          // Solo los assets públicos tienen URL directa; el resto se entrega
          // por la ruta autenticada (la UI compone la URL con `getMediaUrl`).
          url: isPublicStorageKey(object.key) ? `${publicDomain}/${object.key}` : null,
          size: object.size,
          uploadedAt: object.uploaded.toISOString(),
          name: filename,
        };
      });
    },

    /**
     * Deletes a file key using native Cloudflare Workers R2 binding.
     */
    async deleteFile(key: string) {
      if (!bucket) {
        throw new Error('FILES_BUCKET binding is missing');
      }

      await bucket.delete(key);
      return { success: true };
    },

    /**
     * Stores bytes under a deterministic key (overwrite = idempotent).
     * Used for immutable receipt PDFs (Fase 2); the key comes from
     * `panelReceiptKey` (shared), never random.
     */
    async putFile(
      key: string,
      body: Uint8Array | ArrayBuffer | string,
      contentType: string,
    ) {
      if (!bucket) {
        throw new Error('FILES_BUCKET binding is missing');
      }

      await bucket.put(key, body, { httpMetadata: { contentType } });
      return { key };
    },

    /**
     * Reads a file key. Returns null when the object does not exist
     * (the route maps it to 404).
     */
    async getFile(key: string) {
      if (!bucket) {
        throw new Error('FILES_BUCKET binding is missing');
      }

      const obj = await bucket.get(key);
      if (!obj) return null;
      return {
        bytes: new Uint8Array(await obj.arrayBuffer()),
        contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },
  };
}

export type R2Service = ReturnType<typeof createR2Service>;
