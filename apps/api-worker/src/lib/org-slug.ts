import type { Context } from 'hono';
import type { AppEnv } from './env';
import { createOrganizationsRepository } from '../repositories/organizations.repository';

/**
 * Active organization slug: session slug if present, otherwise an org-scoped
 * lookup. Single implementation across all routes.
 */
export async function resolveOrgSlug(
  c: Context<AppEnv>,
  orgId: string,
): Promise<string | null> {
  const fromSession = c.get('org')?.slug as string | null | undefined;
  if (fromSession) return fromSession;
  const org = await createOrganizationsRepository(c.get('db')).findById(orgId);
  return org?.slug ?? null;
}
