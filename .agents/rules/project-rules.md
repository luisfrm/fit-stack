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
Always ask for explicit approval before proceeding with any implementation plan.

## 1. Monorepo Architecture & Boundaries

- **Package Separation**: Respect the boundaries between `apps/` and `packages/`. Logic belonging to a package MUST NEVER be duplicated in an app.
- **Strict Isolation**: Don't mix API and Frontend contexts. Never import anything between apps directly; the only allowed interaction is through shared packages (`packages/shared`).
- **Shared Logic & Types**: Use `@workspace/shared` for any interfaces, DTOs, or constants shared between the backend, frontend, or other consumers. Keep shared business logic here to avoid duplication.
- **Type Safety**: Avoid using the `any` type. Prioritize strict, strong typing for backend, frontend, and shared code.

## 2. UI Design System & Hierarchy

- **Library Origins**: All UI components (buttons, inputs, modals, layout elements) MUST be imported from `@workspace/ui` (`packages/ui`).
- **Variant Enforcements**: Components MUST use their predefined variants. Do not use ad-hoc Tailwind classes to override sizes, spacing, or styles unless absolutely necessary, and only after notifying the user.
- **Mathematical Scale**: Maintain the premium aesthetic using strict generic tokens:
  - **Backgrounds (bg)**: Use `bg-input`, `bg-card`, `bg-surface`, and translucent scales (`bg-white/5`, `bg-white/10`).
  - **Borders**: Subtlety is mandatory. Use low opacity boundaries (`border-white/5`, `border-white/10`, `border-input-border`) over solid hexes. Limit solid colors to focus rings.
  - **Border Radius**:
    - **Inputs, Buttons, CheckboxCards (Internal Controls)**: `rounded-md`
    - **Cards, Containers (Intermediate Surfaces)**: `rounded-xl`
    - **Modals, Dialogs (Large Parent Surfaces)**: `rounded-2xl`

## 3. Database Integrity & ORM

- **ORM Usage**: Always use **Drizzle ORM**. All database-related code, schemas, and clients MUST be imported from `@workspace/database`.
- **Workflow & Safety**: All database changes MUST follow the `generate` -> `review` -> `migrate` cycle. NO database-affecting commands (`push`, `generate`, `migrate`, `seed`) may be executed without explicit and prior approval from the USER.
- **Push Restriction**: `db:push` is EXCLUSIVELY for local prototyping. It is strictly prohibited on shared branches or production.
- **Naming Conventions**: Table names in Drizzle schemas MUST be **singular** (e.g., `user`, `organization`). Repositories and Services MUST be **plural** (e.g., `users.service.ts`).
- **Validation**: Run `npm run db:check` before pushing to ensure schemas match migrations. GitHub Actions verify migrations on PRs automatically.

## 4. Next.js Patterns & Best Practices

- **Server vs Client (RSC)**: Keep the `"use client"` directive only at leaf nodes. Assume everything is a Server Component by default, and perform data fetching exclusively Server-side where possible.
- **State as URL**: Prioritize URL state (`?search=foo`) over React `useState` if the state alters page content and should be persistent/shareable (like pagination, tabs, or global searches).
- **Async Params in Next.js 15+**: `params` and `searchParams` in route handlers and server components are **Promises**. Define them as `Promise<...>` and use `await` before accessing values.
- **Navigation Context**: Do not use `window.location` in client components. Always rely on `useRouter` from `next/navigation` for programmatic routing, and `router.refresh()` to sync server-side state (like auth/org changes) without full reloads.
- **Proxy/Middleware**: The Next.js `proxy.ts` (formerly `middleware.ts`) defines the network boundary. Keep heavy business logic out. Use it solely for CORS, header manipulation, and early session validation.

## 5. Security & Authentication Architecture

- **The Source of Truth**: The `organization` table managed by Better Auth is the sole source of identity (Name/Logo). Do NOT fall back to legacy settings. Uses `authClient.organization.update()`.
- **Layered Structure**:
  - **Config (`auth-client.ts`)**: Setup and native exports.
  - **Client Hook (`use-auth.ts`)**: Wraps native hooks to add role flags (`isAdmin`). Client components MUST use `useAuth()`. NEVER use `useSession()` directly. NEVER read `session.activeOrganization` directly, always rely on `useActiveOrganization()`.
  - **Server Service (`session-service.ts`)**: Used explicitly in Server Components, Layouts, and API layers to fetch isomorphic session data securely.

## 6. Error Handling & Mutations

- **User Feedback**: No silent `console.log()` errors in production components. All form mutations (create, edit, delete) MUST implement a robust `try/catch` block and notify the user of the outcome using `toast.success` or `toast.error` pulling explicit server responses.
