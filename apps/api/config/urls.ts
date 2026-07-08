import { env } from "./envs";

type AppEnvironment = "development" | "production";

const URLS: Record<AppEnvironment, { cms: string; console: string; api: string }> = {
  development: {
    cms: "http://localhost:3001",
    console: "http://localhost:3003",
    api: "http://localhost:3000",
  },
  production: {
    cms: "https://cms.luisrivas.work",
    console: "https://console.luisrivas.work",
    api: "https://api.luisrivas.work",
  },
};

export const urls = URLS[env.appEnv as AppEnvironment];