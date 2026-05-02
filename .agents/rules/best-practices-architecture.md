---
name: best-practices-architecture
description: Clean 3-layer architecture and monorepo boundaries for maximum maintainability.
---

# Architecture & Monorepo Standards

Maintain a predictable, scalable codebase by respecting structural boundaries and the 3-layer backend pattern.

## 1. Monorepo Boundaries
A healthy monorepo relies on strict isolation between its parts.
- **Cross-App Imports**: Never import code directly from one app to another (e.g., `apps/api` should never import from `apps/cms`). 
- **Shared Logic**: Any logic used by more than one app (DTOs, interfaces, common utils) MUST live in `packages/shared`.
- **DRY Packages**: If you find yourself duplicating logic between apps, it’s a signal to move that code to a shared package.

## 2. The 3-Layer Backend Pattern
Every API feature must follow this strict separation to keep business logic isolated from delivery mechanisms.

### Layer 1: Route Handler (`app/api/.../route.ts`)
The entry point. It handles the "outside world."
- **Primary Task**: Authenticate the session via `getSession()`, parse the request body, and validate basic DTO structure.
- **Rule**: Keep it thin. If you're calculating prices or updating two tables at once, that logic belongs in a Service.

### Layer 2: Service (`services/...service.ts`)
The orchestrator. It handles the "how."
- **Primary Task**: Coordinate business rules, call external APIs (Email, PDF), and manage complex workflows.
- **Rule**: Services talk to Repositories, not directly to the Database.

### Layer 3: Repository (`repositories/...repository.ts`)
The data expert. It handles the "what."
- **Primary Task**: Execute Drizzle ORM queries and enforce `organizationId` filtering for multi-tenancy safety.
- **Rule**: No business logic here—only clean, efficient data fetching and persistence.

## 3. Type Safety
- **Strict Typing**: Avoid `any` at all costs. It hides bugs.
- **Inferred Types**: Use Drizzle's `$inferSelect` and `$inferInsert` to keep your TypeScript models in sync with the actual database schema.
