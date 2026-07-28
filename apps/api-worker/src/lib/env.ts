import type { createAuth } from './auth';
import type { Db } from '@workspace/database/factory';

export type Auth = ReturnType<typeof createAuth>;

export type Env = {
  // Database & Security Secrets
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  JWT_SECRET: string;
  COOKIE_DOMAIN?: string;

  // Upstash Redis Caching
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  R2_PUBLIC_URL?: string;


  // Resend Email Services
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;

  // Cloudflare Worker Environment Variables
  BETTER_AUTH_URL: string;

  // Cloudflare Bindings
  FILES_BUCKET: R2Bucket;
  TASK_QUEUE: Queue;
};

export type Session = NonNullable<
  Awaited<ReturnType<Auth['api']['getSession']>>
>['session'] & {
  activeOrganizationId?: string | null;
};

export type SessionUser = NonNullable<
  Awaited<ReturnType<Auth['api']['getSession']>>
>['user'];

export type AppVariables = {
  auth: Auth;
  db: Db;
  session?: Session;
  user?: SessionUser;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AppVariables;
};
