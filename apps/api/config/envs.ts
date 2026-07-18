import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),

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

const isProduction = process.env.APP_ENV === "production";
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

// Solo permitimos validación parcial durante el build si NO estamos en producción real
const _parsed = (isBuildTime && !isProduction) 
  ? envSchema.partial().safeParse(process.env) 
  : envSchema.safeParse(process.env);

if (!_parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(_parsed.error.format(), null, 2));
  if (isBuildTime && !isProduction) {
    console.warn("⚠️  Skipping strict environment validation during build (Non-production)");
  } else {
    throw new Error("Missing or invalid environment variables. Check server logs.");
  }
}

const _env = _parsed.success
  ? _parsed.data
  : (isBuildTime && !isProduction)
    ? { APP_ENV: "development", BETTER_AUTH_SECRET: "dummy-secret-at-least-16-chars" } as any
    : ({} as any);

export const env = {
  appEnv: _env.APP_ENV,
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