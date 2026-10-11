> **Alcance:** capa de datos del frontend (ofetch, contexto de cookies, patrón RSC, convención post-mutación, cache tags).
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## Console API Layer (ofetch)

`apps/console` uses **ofetch** as the unified wrapper for native `fetch` (global rule: **no raw `fetch`** — see [§8 HTTP Client](../../AGENTS.md#8-http-client-ofetch--not-native-fetch)). Replaces axios with a lighter API (~6kb) and native support for `next: { revalidate, tags }`.

### Structure

```
lib/
├── api/
│   ├── client.ts          ← ofetch.create() context-aware
│   ├── types.ts           ← ApiFetchOptions (extends FetchOptions + next)
│   └── exchange-rates.ts  ← external fetch (no auth)
├── services/              ← typed methods (reusable from RSC and client)
│   ├── organizations-service.ts
│   ├── platform-plans-service.ts
│   ├── platform-subscriptions-service.ts
│   ├── staff-service.ts (platform staff: getAll/create/revoke/validateToken/accept)
│   ├── currency-service.ts (legacy, use lib/api/exchange-rates in RSC)
│   ├── init-service.ts
│   ├── upload-service.ts
│   └── session-service.ts (uses authClient, unchanged)
└── hooks/                 ← vanilla hooks (no TanStack Query): use-auth, use-debounce,
                             use-exchange-rates, use-organization-activation, use-theme
```

### Context-aware behavior (`lib/api/client.ts`)

| Context              | Cookie handling                                                            | Interceptors                                                             |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Server (RSC)**     | Reads `cookies()` from `next/headers` and forwards them as `Cookie` header | No `window.location` (no-op)                                             |
| **Client (browser)** | `credentials: 'include'` (browser sends cookies automatically)             | `ORGANIZATION_NOT_FOUND` → `window.location.href = '/reset-org-context'` |

### Service usage pattern

```ts
import { api, type ApiFetchOptions } from "@/lib/api/client";

export const exampleService = {
  // RSC: pass { next: { revalidate, tags } } to cache
  async getAll(
    params?: { page?: number; limit?: number },
    options?: ApiFetchOptions,
  ) {
    return await api("/example", { query: params, ...options });
  },

  // Client: without options, ofetch doesn't cache
  async create(data: any) {
    return await api("/example", { method: "POST", body: data });
  },
};
```

### Post-mutation convention (invalidation + refetch per request)

Every mutation from a client component (modal/form/table action) must run
all three steps **in this order** — neither one alone is enough:

```ts
// 1. Call the service (ofetch `api()` — the HTTP request)
// 2. Purge the Next cache tag via a server action (`updateTag`)
// 3. Re-fetch the RSC (`router.refresh()`)
```

```tsx
// RSC page — owns the server action (it alone can call `updateTag`):
import { updateTag } from "next/cache";

const refreshOrgs = async () => {
  "use server";
  updateTag("console:orgs");  // purges every fetch tagged `console:orgs`
};

return <OrganizationsResults organizations={...} onRefreshServer={refreshOrgs} />;
```

```tsx
// Client component — awaits the purge BEFORE refreshing:
const refresh = React.useCallback(async () => {
  if (onRefreshServer) {
    await onRefreshServer(); // without this, refresh() re-reads stale cache
  }
  router.refresh(); // without this, the purge never reaches the screen
}, [router, onRefreshServer]);
```

Why both: `router.refresh()` re-fetches the RSC but still hits fresh
(`revalidate`, `tags`) cache entries — without `updateTag` the screen shows
stale data until the TTL expires. `updateTag` without `refresh()` purges
silently without re-rendering. Panel uses the same shape
(`members-client.tsx` + `onRefreshServer` prop).

> **Client-only pages (no RSC parent to own the action)**: the purge travels
> through a shared `"use server"` module instead — reference:
> `apps/panel/lib/actions/settings.ts` (`invalidateSettingsCache`), consumed by
> the `useSettings` hook of the panel `settings/*` pages. It derives the tag from
> the **session on the server** (`sessionService.getSession()`, i.e.
> `session?.session?.activeOrganizationId`), never from a value the client sends,
> and the caller `await`s it before `router.refresh()`.
>
> This is not optional: **`updateTag` is server-only**, so a client component
> that imports `next/cache` breaks (the settings save failed silently that way).
> Before adding a purge, check where the consumer lives: RSC → inline `"use
> server"` action passed as a prop; client-only page → shared action module.
> When in doubt, grep for `next/cache` in a client file — it must never appear.

> **Actionable lists always fresh**: the "To validate" list in
> `/payments` is requested with `cache: 'no-store'` (`payments/page.tsx`). A work
> list cannot have staleness: a payment recorded through another channel must
> appear on reload, not when a TTL expires. The subscriptions table can
> tolerate `revalidate: 60` + tag because every write in the app purges it.

> **Next.js 16 note**: `revalidateTag(tag, profile)` now requires a `profile` (string or `CacheLifeConfig`). For server actions use `updateTag(tag)` (new in Next 16, no profile).

### Console Cache Tags

| Tag                 | Endpoint                                         |
| ------------------- | ------------------------------------------------ |
| `console:orgs`      | `/api/platform/organizations*`                   |
| `console:plans`     | `/api/platform/plans*` (with-stats, summary)     |
| `console:subs`      | `/api/platform/subscriptions*` (includes /stats) |
| `console:settings`  | `/api/platform/settings`                         |
| `console:staff`     | `/api/platform/staff`                            |
| `console:knowledge` | `/api/platform/knowledge*`                       |
| `console:receipts`  | `/api/platform/subscriptions/receipts`           |

### RSC Pattern in `apps/console`

- **Pages are Server Components** (no `"use client"`) that call services directly with caching options.
- **Filters and pagination in URL** (`searchParams` is `Promise<...>` in Next 15+):
  ```tsx
  export default async function Page({
    searchParams,
  }: {
    searchParams: Promise<{ query?: string; page?: string }>;
  }) {
    const { query, page = "1" } = await searchParams;
    const result = await service.getAll({ query, page });
    // ...
  }
  ```
- **Client leaves** (search inputs, pagination buttons, modals) use `useRouter` + `searchParams` from `next/navigation` to modify the URL → server re-render.
- **Type C pages** (currencies, payment-methods) are already **RSC parent + client child with `initialData`**: the server fetches settings (`console:settings`) and the client starts with the data (no loading flash) and saves via `api POST` + server action `updateTag`. The `organizations/[id]/settings` page remains client (fetch with `useState`/`useEffect`, no TanStack Query).
- **TanStack Query is REMOVED from the project** (console and panel). Single standard: **RSC + ofetch + Next cache for all reads**; mutations in RSC pages use `service → toast → updateTag → refresh`. A client-side fetching library would only be reintroduced if a live-data feature (polling, optimistic UI, infinite scroll) justifies it.
- **Reusable module pattern** (dashboard/staff/subscriptions/organizations): pure selectors in `lib/platform/*-selectors.ts` (unit-tested) + permissions in `lib/platform-permissions.ts` + server-safe formatting in `lib/utils/value-converters.ts` (`formatCents`, `formatShortDate`); tables with `MAX_ITEMS=10` and URL filters; unique hooks → `data-testid`, repeated hooks → `class`.

### Settings constants

- `PLATFORM_SETTINGS_KEYS` → `apps/console/lib/config/platform-settings.ts` (platform settings)
- `SETTINGS_KEYS` → `apps/console/lib/config/settings.ts` (organization settings)

Both are imported from server and client (they don't depend on hooks).
