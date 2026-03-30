import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
  }
};
