---
name: project-rules
description: Essential coding standards and architectural rules for the Fit-Stack repository, focusing on package separation, database usage, and type safety.
---

# Fit-Stack Project Rules

These rules are mandatory for all development tasks within the Fit-Stack repository. Adherence ensures consistency, maintainability, and architectural integrity.

## 1. Database Operations
- **ORM**: Always use **Drizzle ORM** for database interactions.
- **Source**: All database-related code, schemas, and clients MUST be imported from `@workspace/database` (located in `packages/database`).
- **Pattern**: Do not define schemas or raw queries outside of the database package.
- **Safety**: **NO database-affecting command (push, generate, migrate, seed, etc.) may be executed without explicit and prior approval from the USER for that specific command.**

## 2. UI Components
- **Library**: All UI components (buttons, inputs, modals, etc.) MUST be imported from `@workspace/ui` (located in `packages/ui`).
- **Variants**: If a task requires a new variant or a modification to an existing variant in a UI component, **you must inform the user** before proceeding with the change.

## 3. Shared Logic and Types
- **Interfaces**: Use `@workspace/shared` (located in `packages/shared`) for any interfaces or types that are shared between the API, CMS, or other apps.
- **Consistency**: Keep business logic that is shared between packages within the `shared` package to avoid duplication.

## 4. Type Safety
- **No `any`**: Avoid using the `any` type in the codebase. Use proper TypeScript interfaces, types, or generics.
- **Strict Typing**: Prioritize strong typing for both backend and frontend code to ensure reliability.

## 5. Architectural Constraints
- **Package Separation**: Respect the boundaries between `apps/` and `packages/`. Logic belonging to a package should not be duplicated in an app.
