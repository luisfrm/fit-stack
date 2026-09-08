# Plan: Validación de slug único en vivo + detalle de organización por slug

## Contexto

- El slug de `organization` ya es único en DB (`packages/database/src/schema.ts:80` → `text('slug').unique()`) y hay validación server-side en `organizations.service.ts:36-38` (create) y `:72-77` (update), pero lanza un `Error` plano que el handler global devuelve como **500** — la UI muestra `toast.error("Algo salió mal")` sin saber que es un slug repetido.
- La página de detalle de la organización usa `organizations/[id]/...` y hay navegaciones con `org.id` / `sub.organizationId`. Se reemplaza `[id]` por `[slug]`.

## Cambios

### A. Backend (`apps/api-worker`)

**1. `routes/platform-organizations.route.ts`** — nuevos endpoints (registrados antes de `/:id`):

- `GET /check-slug` (`requirePlatformAuth`, `zValidator('query', { slug: z.string().min(1), excludeId: z.string().optional() })`)
  - Slug en uso (y `id !== excludeId`) → **409** `{ error: 'El slug ya está en uso por otra organización', code: 'SLUG_TAKEN' }`
  - Disponible → **200** `{ available: true }`
- `GET /by-slug/:slug` (`requirePlatformAuth`)
  - Usa `findBySlug` del repo (ya existe, `organizations.repository.ts:181`)
  - Encontrada → 200 con la org; no → **404** `{ error: 'Organización no encontrada' }`

**2. `services/organizations.service.ts`** — convertir el conflicto de slug en create/update a `HTTPException(409, ...)` con `code: 'SLUG_TAKEN'` (mismo patrón de respuesta que `FEATURE_NOT_AVAILABLE` en `lib/route-handler.ts:189-198`).

### B. Console — servicio (`apps/console/lib/services/organizations-service.ts`)

- `checkSlug(slug, excludeId?)` → `GET /platform/organizations/check-slug`
- `getBySlug(slug, options)` → `GET /platform/organizations/by-slug/:slug`

### C. Console — detalle por slug

- Renombrar carpeta `app/(protected)/organizations/[id]` → `[slug]`:
  - `[slug]/subscriptions/page.tsx`: `params.slug` → `getBySlug` → `notFound()` si no existe → usar `org.id` internamente para `getAll({ organizationId })`; título con `org.name`.
  - `[slug]/settings/layout.tsx`: `useParams().slug` → `OrgSettingsNav` con prop renombrada `organizationSlug`.
  - `[slug]/settings/page.tsx` y `[slug]/settings/staff/page.tsx`: `params.slug` → `getBySlug` → `org.id` para update/staff.
- `components/dashboard/org-settings-nav.tsx`: prop `organizationId` → `organizationSlug`; hrefs `/organizations/${organizationSlug}/settings...`.
- `components/dashboard/organizations-table.tsx:186`: `router.push(\`/organizations/${org.slug ?? org.id}/settings\`)`.
- `components/platform/subscriptions-table.tsx:126/234`: `sub.organizationSlug ?? sub.organizationId`.
- `packages/shared/src/types.ts`: agregar `organizationSlug?: string | null` a `IPlatformSubscription` (la API ya lo devuelve en los selects del repo).
- `components/dashboard/organization-mobile-card.tsx:119`: "Entrar" → `/organizations/${org.slug ?? org.id}/subscriptions` (arregla el 404 actual).

### D. Console — validación en vivo del slug (`components/dashboard/organization-form.tsx`)

- `const debouncedSlug = useDebounce(slug, 500)` (hook existente `@/lib/hooks/use-debounce`).
- Estado: `slugStatus: 'idle' | 'valid' | 'error'` + `slugError`.
- Efecto sobre `debouncedSlug`:
  - Vacío → `idle`.
  - Si no → `organizationsService.checkSlug(debouncedSlug, isEdit ? initialData?.id : undefined)`:
    - OK → `valid` (input `state="success"`, hint "Slug disponible").
    - `409` + `code === 'SLUG_TAKEN'` → `error` + `toast.error("El slug ya está en uso por otra organización")` (solo en transición, sin spam) + `state="error"` con hint del error.
    - Otro error → `error` sin toast engañoso.
- Al cambiar el input → reset a `idle`.
- `handleSubmit` (Step 1): si `slugStatus === 'error'` → `toast.error` y no avanza.

## Verificación

- `pnpm --filter api-worker typecheck` y `pnpm --filter console typecheck`
- Manual: crear org con slug existente (`fitstack-1`) → error + toast a los ~500ms; slug nuevo → estado validado; `/organizations/fitstack-1/subscriptions` carga.
- E2E existentes no se ven afectados (no navegan al detalle por id).
