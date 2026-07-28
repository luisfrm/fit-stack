import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from './env';

export function createR2Service(env: Env) {
  const bucket = env.FILES_BUCKET;

  return {
    /**
     * Generates a presigned URL for direct client-side S3 uploads to Cloudflare R2.
     */
    async getPresignedUploadUrl(filename: string, contentType: string) {
      const accountId = process.env.R2_ACCOUNT_ID;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME || 'fit-stack-files';

      if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error('Cloudflare R2 S3 credentials are not configured.');
      }

      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        ContentType: contentType,
      });

      const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
      return { presignedUrl, key: filename };
    },

    /**
     * Lists files under a given prefix using native Cloudflare Workers R2 binding.
     */
    async listFiles(prefix: string) {
      if (!bucket) {
        throw new Error('FILES_BUCKET binding is missing');
      }

      const publicDomain = process.env.R2_PUBLIC_DOMAIN || 'https://assets.luisrivas.work';
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
