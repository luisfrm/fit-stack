import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '@/config/envs';

const accountId = env.r2AccountId;
const accessKeyId = env.r2AccessKeyId;
const secretAccessKey = env.r2SecretAccessKey;
const bucketName = env.r2BucketName;

let S3: S3Client | undefined = undefined;

if (accountId && accessKeyId && secretAccessKey) {
  S3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export const r2Service = {
  /**
   * Generates a presigned URL for uploading a file.
   */
  async getPresignedUploadUrl(filename: string, contentType: string) {
    if (!S3) {
      throw new Error('Las credenciales de Cloudflare R2 no están configuradas en el servidor.');
    }

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: filename,
      ContentType: contentType,
    });

    // La URL es válida por 15 minutos (900 segundos)
    const presignedUrl = await getSignedUrl(S3, command, { expiresIn: 900 });
    return { presignedUrl, key: filename };
  },

  /**
   * Lists files in the bucket with a specific prefix (folder).
   */
  async listFiles(prefix: string) {
    if (!S3) {
      throw new Error('Las credenciales de Cloudflare R2 no están configuradas.');
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const response = await S3.send(command);
    return response.Contents?.map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
    })) || [];
  },

  /**
   * Deletes a file from the bucket.
   */
  async deleteFile(key: string) {
    if (!S3) {
      throw new Error('Las credenciales de Cloudflare R2 no están configuradas.');
    }

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await S3.send(command);
    return { success: true };
  }
};
