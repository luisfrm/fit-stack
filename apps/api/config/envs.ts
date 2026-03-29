const APP_ENV = (process.env.APP_ENV ?? "development") as "development" | "staging" | "production";

export const env = {
  appEnv: APP_ENV,
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3001",
  isLocal: APP_ENV === "development",
  isProduction: APP_ENV === "production",
};