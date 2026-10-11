import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_R2_URL: z.string().url(),
});

// In the CMS (Next.js), verify which side we are executing on
// to prevent error logs from saturating the browser console
const parsed = envSchema.safeParse({
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL,
});

const isProduction = process.env.APP_ENV === "production";
const isBuildTime = process.env.CI === "true" || process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test";

if (!parsed.success) {
  if (globalThis.window === undefined) {
    // In real production, NEVER skip env validation
    if (isBuildTime && !isProduction) {
      console.warn("⚠️  Skipping strict CMS env validation during build/CI (Non-production)");
    } else {
      console.error("❌ Invalid CMS environment variables:", JSON.stringify(parsed.error.format(), null, 2));
      throw new Error("Invalid CMS environment variables");
    }
  } else {
    console.error("❌ CMS Environment validation failed on client", parsed.error.format());
  }
}

function getValidatedEnv(): z.infer<typeof envSchema> {
  if (parsed.success) {
    return parsed.data;
  }
  if (isBuildTime && !isProduction) {
    return {
      APP_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001",
      NEXT_PUBLIC_R2_URL: "http://localhost:3001",
    };
  }
  return {} as z.infer<typeof envSchema>;
}

const validatedEnv = getValidatedEnv();

export const env = {
  appEnv: validatedEnv.APP_ENV ?? "development",
  apiBaseUrl: validatedEnv.NEXT_PUBLIC_API_BASE_URL,
  r2Url: validatedEnv.NEXT_PUBLIC_R2_URL,
  isLocal: (validatedEnv.APP_ENV ?? "development") === "development",
  isProduction: validatedEnv.APP_ENV === "production",
};
