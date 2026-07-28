import type { Env } from './env';

export function createR2Service(env: Env) {
  const bucket = env.FILES_BUCKET;

  return {
    /**
     * Generates a direct upload URL via Worker's native R2 storage endpoint.
     */
    async getUploadUrl(key: string, apiBaseUrl: string) {
      const cleanBaseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
      const presignedUrl = `${cleanBaseUrl}/upload/direct?key=${encodeURIComponent(key)}`;
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
          url: `${publicDomain}/${object.key}`,
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
  };
}

export type R2Service = ReturnType<typeof createR2Service>;
