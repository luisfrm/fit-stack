---
name: best-practices-database
description: Database integrity, Drizzle ORM usage, and multi-tenancy isolation.
---

# Database Integrity & Multi-tenancy

Ensure data safety and 100% isolation between organizations using Drizzle ORM and strict filtering rules.

## 1. ORM Usage & Safety
- **Single Source**: Always use **Drizzle ORM**. Import all schemas and clients from `@workspace/database`.
- **Migration Cycle**: Follow the `generate` -> `review` -> `migrate` workflow.
- **Push Restriction**: `db:push` is for local prototyping only. Never use it on shared branches or production environments.

## 2. Mandatory Multi-tenancy Isolation
Fit-Stack is a multi-tenant platform. Data leaks between organizations are a critical failure.
- **Repository Filter**: Every query in a repository MUST include a `.where(eq(schema.organizationId, organizationId))` clause.
- **Session Anchor**: Always extract the `organizationId` from the verified server-side session, never trust an ID provided in the request body that can be tampered with.

## 3. Naming Conventions
Follow these patterns to keep the schema and its consumers predictable:
- **Table Names**: Use **singular** form (e.g., `user`, `membership_plan`).
- **File Names**: Repository and Service files use **plural** form (e.g., `users.service.ts`, `payments.repository.ts`).
- **Columns**: Use camelCase for TypeScript fields and snake_case for DB columns in the schema definition.

## 4. Drizzle Best Practices
- **Atomic Operations**: Wrap multi-table updates in a transaction: `await db.transaction(async (tx) => { ... })`.
- **Relationship Enrichment**: Define and use Drizzle `relations` to fetch associated data efficiently instead of manual multiple queries.
