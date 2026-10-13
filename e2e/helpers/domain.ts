/**
 * Domain helpers — resolve the id of a resource by its name/email.
 *
 * They serve the journeys that create data **from the UI**: when the test creates
 * something by clicking, the fixture cannot know the id beforehand, so it is
 * looked up via the API and registered with `track(...)` so it is deleted at the end.
 */
import type { ApiClient } from './api-client';

interface Paginated<T> {
  data?: T[];
}

async function findByQuery<T extends { id: number }>(
  api: ApiClient,
  path: string,
  query: string,
  predicate: (row: T) => boolean,
  label: string,
): Promise<T> {
  const res = await api.get<Paginated<T>>(path, { query, limit: 50 });
  const match = (res?.data ?? []).find(predicate);
  if (!match) {
    throw new Error(`No se encontró ${label} con query "${query}" (¿se creó desde la UI?)`);
  }
  return match;
}

export async function findMemberByEmail(
  api: ApiClient,
  email: string,
): Promise<{ id: number }> {
  return findByQuery(api, '/api/members', email, (row: any) => row.email === email, 'el cliente');
}

export async function findPlanByName(api: ApiClient, name: string): Promise<{ id: number }> {
  return findByQuery(
    api,
    '/api/plans',
    name,
    (row: any) => row.name === name,
    'el plan',
  );
}

export async function findClassByName(api: ApiClient, name: string): Promise<{ id: number }> {
  return findByQuery(
    api,
    '/api/classes',
    name,
    (row: any) => row.name === name,
    'la clase',
  );
}

export async function findCmsPageBySlug(
  api: ApiClient,
  slug: string,
): Promise<{ id: number }> {
  const pages = await api.get<Array<{ id: number; slug: string }>>('/api/cms/pages');
  const match = (pages ?? []).find((page) => page.slug === slug);
  if (!match) throw new Error(`No se encontró la página CMS con slug "${slug}"`);
  return match;
}
