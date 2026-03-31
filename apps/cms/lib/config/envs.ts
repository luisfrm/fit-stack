import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_R2_URL: z.string().url(),
});

// En el CMS, al ser Next.js, verificamos en qué lado estamos
// para evitar que el log de error sature el navegador
const parsed = envSchema.safeParse({
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
  NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL,
});

if (!parsed.success) {
  if (globalThis.window === undefined) {
    console.error("❌ Invalid CMS environment variables:", JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid CMS environment variables");
  } else {
    // En el cliente, solo fallamos si es crítico, pero el error ya sale en consola
    console.error("❌ CMS Environment validation failed on client", parsed.error.format());
  }
}

const validatedEnv = parsed.success ? parsed.data : ({} as z.infer<typeof envSchema>);

export const env = {
  appEnv: validatedEnv.APP_ENV ?? "development",
  apiBaseUrl: validatedEnv.NEXT_PUBLIC_API_BASE_URL,
  r2Url: validatedEnv.NEXT_PUBLIC_R2_URL,
  isLocal: (validatedEnv.APP_ENV ?? "development") === "development",
  isProduction: validatedEnv.APP_ENV === "production",
};
