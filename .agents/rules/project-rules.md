---
trigger: always_on
---

---

name: project-rules
description: Essential coding standards and architectural rules for the Fit-Stack repository, focusing on package separation, database usage, and type safety.

---

# Fit-Stack Project Rules

These rules are mandatory for all development tasks within the Fit-Stack repository. Adherence ensures consistency, maintainability, and architectural integrity.

Implementation plans should be in Spanish.

Always ask for approval before proceed in any implementation plan.

## 1. Database Operations

- **ORM**: Always use **Drizzle ORM** for database interactions.
- **Source**: All database-related code, schemas, and clients MUST be imported from `@workspace/database` (located in `packages/database`).
- **Pattern**: Do not define schemas or raw queries outside of the database package.
- **Safety**: **NO database-affecting command (push, generate, migrate, seed, etc.) may be executed without explicit and prior approval from the USER for that specific command.**

## 2. UI Components

- **Library**: All UI components (buttons, inputs, modals, etc.) MUST be imported from `@workspace/ui` (located in `packages/ui`).
- **Variants**: If a task requires a new variant or a modification to an existing variant in a UI component, **you must inform the user** before proceeding with the change. You must never should any dynamic classname, it's supposed the variants have all the styles necesaries, if it's necessary any hardcode classname you must inform to human.

## 3. Shared Logic and Types

- **Interfaces**: Use `@workspace/shared` (located in `packages/shared`) for any interfaces or types that are shared between the API, CMS, or other apps.
- **Consistency**: Keep business logic that is shared between packages within the `shared` package to avoid duplication.

## 4. Type Safety

- **No `any`**: Avoid using the `any` type in the codebase. Use proper TypeScript interfaces, types, or generics.
- **Strict Typing**: Prioritize strong typing for both backend and frontend code to ensure reliability.

## 5. Naming Conventions

- **Tables**: Database table names in Drizzle schemas MUST be in **singular** (e.g., `user`, `organization`, `gym_member`).
- **Services & Repositories**: File names and class/object names for services and repositories MUST be in **plural** (e.g., `users.service.ts`, `members.repository.ts`).

## 6. Architectural Constraints

- **Package Separation**: Respect the boundaries between `apps/` and `packages/`. Logic belonging to a package should not be duplicated in an app.

## 7. Next.js & API Rules

- **Async Params**: In Next.js 15+ (used in `apps/api`), the `params` and `searchParams` props in route handlers and server components are **Promises**. You MUST define them as `Promise<...>` and use `await` before accessing their properties.
- **Middleware/Proxy**: The project follows the Next.js 16 convention where `middleware.ts` is renamed to `proxy.ts`. This shift clarifies its purpose as a network boundary/routing layer rather than a place for heavy business logic. Use it for CORS, header manipulation, and early session validation, but keep robust authorization and logic within route handlers or the service layer.

## 8. Database Integrity & Migrations

- **Workflow**: All database changes MUST follow the `generate` -> `review` -> `migrate` cycle.
- **Verification**: Before pushing, run `npm run db:check` in `packages/database` to ensure the schema matches the migrations folder.
- **Push Restriction**: The command `db:push` is EXCLUSIVELY for local development and rapid prototyping. It is strictly prohibited for shared branches (`master`, `staging`) or production.
- **Automation**: The project uses GitHub Actions (`database-integrity.yml`) to:
  1.  **Check**: Statically verify migration integrity on every Pull Request.
  2.  **Deploy**: Automatically run `db:migrate` on production/dev when merging to `master`.
- **Secrets**: Production `DATABASE_URL` must be managed as a GitHub Secret.
## 9. Navigation in Next.js
- **No `window.location`**: Do not use `window.location` for navigation or page refreshes in client components.
- **Router hooks**: Use `useRouter` from `next/navigation` to handle programmatic navigation.
- **State Sync**: Use `router.refresh()` to sync server-side state (like sessions or active organizations) without a full browser reload.

## 10. CMS Authentication Architecture

The CMS uses a layered auth system. Each layer has a single, exclusive responsibility:

| Layer              | File                                       | Used In                                | Responsibility                                                                                                                                  |
| ------------------ | ------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Config**         | `apps/cms/lib/auth-client.ts`              | Everywhere                             | Better Auth client setup, type exports (`Session`, `User`), native hook re-exports (`useSession`, `useActiveOrganization`, `organization`)      |
| **Client Hook**    | `apps/cms/lib/hooks/use-auth.ts`           | Client Components                      | Wraps `useSession` + `useActiveOrganization`. Adds role flags (`isAdmin`, `isCoach`). **This is the standard for all client-side auth access.** |
| **Server Service** | `apps/cms/lib/services/session-service.ts` | Server Components, Layouts, Middleware | Async session fetching for SSR. Never import this in client components.                                                                         |

## 11. Better Auth usage rules

- **Client components** MUST use `useAuth()` from `@/lib/hooks/use-auth`. Do NOT call `useSession()` or `useActiveOrganization()` directly in components.
- **Server components / Layouts** MUST use `sessionService.getSession()` from `@/lib/services/session-service`.
- **Active Organization**: Always comes from `useActiveOrganization()` (via `useAuth`). Do NOT read `session.activeOrganization` — it is not populated by `useSession` by Better Auth design.
- **Identity (Name/Logo)**: The `organization` table (Better Auth) is the source of truth. Do NOT use `gym_settings` for `GYM_NAME` or `GYM_LOGO`. Use `authClient.organization.update()` to save identity changes.

## 12. Don't mix API and Frontend. Never import anything between apps, the only way is using shared packages.

## 13. UI Design Elements & Hierarchy Scale

The project strictly follows a mathematical scale for borders, radiuses, and backgrounds to maintain a premium aesthetic. Do NOT mix styles randomly.

- **Backgrounds (bg)**: Use the defined CSS variables (`bg-input`, `bg-card`, `bg-surface`) and translucent scales (`bg-white/5`, `bg-white/10`).
- **Borders**: Subtlety is mandatory. Use low opacity boundaries (`border-white/5`, `border-white/10` or `border-border`) rather than solid hexes, reserving solid colors for focus rings.
- **Border Radius Scale**:
  - **Inputs, Buttons, CheckboxCards (Internal Controls)**: `rounded-md`
  - **Cards, Containers (Intermediate Surfaces)**: `rounded-xl`
  - **Modals, Dialogs (Large Parent Surfaces)**: `rounded-2xl`
