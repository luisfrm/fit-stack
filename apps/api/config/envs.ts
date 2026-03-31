const APP_ENV = (process.env.APP_ENV ?? "development") as "development" | "staging" | "production";

export const env = {
  appEnv: APP_ENV,
  frontendUrl: process.env.FRONTEND_URL,
  isLocal: APP_ENV === "development",
  isProduction: APP_ENV === "production",

  // Cloudflare R2
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2BucketName: process.env.R2_BUCKET_NAME,
  r2PublicUrl: process.env.R2_PUBLIC_URL,

  // Better-Auth
  betterAuthSecret: process.env.BETTER_AUTH_SECRET,
  cookieDomain: process.env.COOKIE_DOMAIN,

  // JWT
  jwtSecret: process.env.JWT_SECRET,
};