## Description

<!-- What changes and why? Give the reviewer context. -->

## Type of change

`feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `chore`/`ci`/`config` · `BREAKING CHANGE`

## Affected apps / packages

<!-- api-worker · jobs-worker · panel · console · web · shared · database · auth · ui · infra -->

## How to test

<!-- Concrete steps to validate the change (commands, URLs, test data). -->

1.
2.

## Checklist (project rules CI cannot verify)

- [ ] Money is in **integer cents** (`bigint` / `z.number().int()`); display only via `formatCents`
- [ ] Timezone resolved from the session (`session.activeOrganization.timezone`), no silent fallbacks
- [ ] HTTP calls use `ofetch` (no native `fetch`)
- [ ] Post-mutation flow: `service → updateTag → router.refresh()`
- [ ] Queries filter by `organizationId`; permissions validated server-side
- [ ] Migrations follow `generate → review → migrate` (never `db:push` on shared branches)

## Notes for the reviewer

<!-- Design decisions, trade-offs, points of attention. -->
