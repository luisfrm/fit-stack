import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),

  // Frontend
  FRONTEND_URL: z.string().url(),

  // Better-Auth
  BETTER_AUTH_SECRET: z.string().min(16),
  COOKIE_DOMAIN: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(16).optional(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const _parsed = envSchema.safeParse(process.env);
if (!_parsed.success) {
  console.error("❌ Invalid environment variables:", _parsed.error.flatten().fieldErrors);
  throw new Error("Missing or invalid environment variables. Check server logs.");
}

const _env = _parsed.data;

export const env = {
  appEnv: _env.APP_ENV,
  frontendUrl: _env.FRONTEND_URL,
  isLocal: _env.APP_ENV === "development",
  isProduction: _env.APP_ENV === "production",

  // Cloudflare R2
  r2AccountId: _env.R2_ACCOUNT_ID,
  r2AccessKeyId: _env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: _env.R2_SECRET_ACCESS_KEY,
  r2BucketName: _env.R2_BUCKET_NAME,
  r2PublicUrl: _env.R2_PUBLIC_URL,

  // Upstash Redis
  upstashRedisRestUrl: _env.UPSTASH_REDIS_REST_URL,
  upstashRedisRestToken: _env.UPSTASH_REDIS_REST_TOKEN,

  // Better-Auth
  betterAuthSecret: _env.BETTER_AUTH_SECRET,
  cookieDomain: _env.COOKIE_DOMAIN,

  // JWT
  jwtSecret: _env.JWT_SECRET,
};