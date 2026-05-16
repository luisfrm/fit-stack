import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_R2_URL: z.string().url(),
});

const parsed = envSchema.safeParse({
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL,
});

const isProduction = process.env.APP_ENV === "production";
const isBuildTime = process.env.CI === "true" || process.env.NEXT_PHASE === "phase-production-build" || process.env.NODE_ENV === "test";

if (!parsed.success) {
  if (globalThis.window === undefined) {
    if (isBuildTime && !isProduction) {
      console.warn("⚠️  Skipping strict Console env validation during build/CI (Non-production)");
    } else {
      console.error("❌ Invalid Console environment variables:", JSON.stringify(parsed.error.format(), null, 2));
      throw new Error("Invalid Console environment variables");
    }
  } else {
    console.error("❌ Console Environment validation failed on client", parsed.error.format());
  }
}

const validatedEnv = parsed.success 
  ? parsed.data 
  : (isBuildTime && !isProduction)
    ? { APP_ENV: "development", NEXT_PUBLIC_API_BASE_URL: "http://localhost:3001", NEXT_PUBLIC_R2_URL: "http://localhost:3001" }
    : ({} as z.infer<typeof envSchema>);

export const env = {
  appEnv: validatedEnv.APP_ENV ?? "development",
  apiBaseUrl: validatedEnv.NEXT_PUBLIC_API_BASE_URL,
  r2Url: validatedEnv.NEXT_PUBLIC_R2_URL,
  isLocal: (validatedEnv.APP_ENV ?? "development") === "development",
  isProduction: validatedEnv.APP_ENV === "production",
};