---
description: Review architecture against AGENTS.md and ARCHITECTURE.md conventions
agent: architect
---

Review the architecture of the current changes (or the whole repo) against the conventions in `AGENTS.md` and `ARCHITECTURE.md`.

Check: layer boundaries (Route Handler → Service → Repository), factory pattern (`createXRepository(db)` / `createXService(repo)`), multi-tenancy isolation (`organizationId` everywhere), middleware usage (`requireOrgPermission` / `requirePlatformPermission`), `@workspace/*` package boundaries, Upstash cache key conventions and invalidation strategy, and `FitTaskEvent` job contracts.

Report findings by impact with affected files, risk, and options. If you propose a refactor, provide a step-by-step plan with verification for each step.

Scope / focus: $ARGUMENTS
