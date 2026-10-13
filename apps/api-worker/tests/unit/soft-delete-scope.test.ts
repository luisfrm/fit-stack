/**
 * Scope guard for the `membership_plan` soft delete (RD-142).
 *
 * The soft-delete filter (`deleted_at IS NULL`) lives in ONE place: the plans
 * repository, where every read is filtered by default. Any other module that
 * queried the table directly could silently resurrect a deleted plan, so this
 * test pins the allowlist of readers. It is deliberately a convention test: the
 * api-worker has no ESLint setup, and a failing test is the cheapest alarm that
 * forces a new reader through review.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Files allowed to read `membership_plan`, and why. */
const ALLOWED_READERS = [
  // Owns the filter: every read defaults to `deleted_at IS NULL`.
  'src/repositories/plans.repository.ts',
  // Joins for history on purpose: the plan name of a soft-deleted plan must
  // keep resolving in the subscriptions list, dashboard and latest period.
  'src/repositories/subscriptions.repository.ts',
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('membership_plan read scope', () => {
  it('is only read from the plans and subscriptions repositories', () => {
    const readers = listTsFiles(join(process.cwd(), 'src'))
      .filter((file) => /\bmembershipPlan\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file).split(sep).join('/'))
      .sort();

    expect(readers).toEqual([...ALLOWED_READERS].sort());
  });
});
