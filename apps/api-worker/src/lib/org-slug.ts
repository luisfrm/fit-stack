import type { Context } from 'hono';
import type { AppEnv } from './env';
import { createOrganizationsRepository } from '../repositories/organizations.repository';

/**
 * Slug de la organización activa: el de la sesión si está, y si no un lookup
 * org-scoped. Una sola implementación para todos los routes — antes vivía en
 * `payments.route.ts` y estaba copiada inline en `subscriptions.route.ts`.
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
