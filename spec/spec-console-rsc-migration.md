# Spec: Migración de Console a React Server Components

## Overview

La app `apps/console` tiene **todas sus páginas marcadas como `"use client"`**, lo que significa que:

1. Todo el JavaScript de cada vista se envía al navegador.
2. Los datos se obtienen con `useEffect` + `axios` generando waterfalls de peticiones desde el cliente.
3. Se mantienen estados manuales (`useState`) para datos, loading y error que Next.js ya resuelve de forma nativa con Server Components + Suspense + error boundaries.

El objetivo de esta migración es **convertir las páginas a Server Components** y dejar `"use client"` exclusivamente en los nodos hoja interactivos (modales, formularios, botones de acción, inputs de búsqueda).

---

## Inventario Actual (Estado de Cada Página)

### Páginas del Dashboard

| Archivo | Tipo Actual | Estados Cliente | Data Fetching | Interactividad Real |
|:---|:---:|:---:|:---|:---|
| `dashboard/page.tsx` | `"use client"` | `organizations[]`, `isLoading` | `useEffect` → `organizationsService.getAll()` | Modal de nueva org, links |
| `dashboard/layout.tsx` | ✅ **Server** | Ninguno | `sessionService.getSession()`, `getUserRole()` | Ninguna |
| `dashboard/organizations/page.tsx` | `"use client"` | `organizations[]`, `loading`, `total`, `query`, `searchTerm`, `page`, `totalPages`, `selectedOrg`, `isSubModalOpen` | `useCallback` → `organizationsService.getAll()` | Búsqueda, paginación, modales (crear/editar org, crear suscripción) |
| `dashboard/organizations/[id]/settings/page.tsx` | `"use client"` | `org`, `isLoading`, `isUpdating` | `useEffect` → `organizationsService.getById()` | Formulario de settings (edición) |
| `dashboard/organizations/[id]/subscriptions/page.tsx` | `"use client"` | `page` | `useQuery` → `platformSubscriptionsService.getAll()` | Paginación, botón volver |
| `dashboard/plans/page.tsx` | `"use client"` | `plans[]`, `summary`, `loading` | `useEffect` → `platformPlansService.getAllWithStats()` + `.getSummary()` | Modal crear/editar plan |
| `dashboard/subscriptions/page.tsx` | `"use client"` | `searchTerm`, `activeFilter`, `page` | `useQuery` → `platformSubscriptionsService.getAll()` + `.getStats()` | Búsqueda, filtros por status, paginación, modal nueva suscripción |
| `dashboard/settings/layout.tsx` | `"use client"` | Ninguno (solo `usePathname`) | Ninguno | NavTabs, botón "Volver" en móvil |
| `dashboard/settings/page.tsx` | ✅ **Server** | Ninguno | `redirect()` | Ninguna |
| `dashboard/settings/currencies/page.tsx` | `"use client"` | `activeCurrencies[]`, `primaryCurrency`, `allCurrencies[]`, `searchQuery`, `isFetchingCodes`, `isEditingCurrencies`, `currencyFormat` | `usePlatformSettings()` + `useEffect` → `currencyService.getExchangeRates()` | Selección/toggle de monedas, búsqueda, radio format, guardar |
| `dashboard/settings/payment-methods/page.tsx` | `"use client"` | `paymentMethods[]`, `editingMethod`, `isModalOpen` | `usePlatformSettings()` + `useEffect` | CRUD de métodos, modal editor de campos, guardar |

---

## Clasificación por Tipo de Migración

### Tipo A — Conversión Directa a Server Component
Páginas que **solo muestran datos** y tienen interactividad mínima (un modal o un link). Se convierten directamente a `async function` en el servidor.

- **`dashboard/page.tsx`** — El dashboard principal solo muestra StatCards + una lista de organizaciones. Los modales se extraen como hojas cliente.
- **`dashboard/plans/page.tsx`** — Muestra StatCards + grid de PlanCards. Los modales de crear/editar ya son componentes separados.

### Tipo B — Patrón Server + Client Split
Páginas con **datos iniciales estáticos** pero interactividad compleja (búsqueda, paginación, filtros). El Server Component carga los datos iniciales y los pasa al componente cliente.

- **`dashboard/organizations/page.tsx`** — Carga inicial de organizaciones en servidor + componente cliente para búsqueda/paginación/modales.
- **`dashboard/subscriptions/page.tsx`** — KPIs cargados en servidor + componente cliente para filtros/búsqueda/paginación.
- **`dashboard/organizations/[id]/subscriptions/page.tsx`** — Datos del org cargados en servidor + tabla paginada en cliente.

### Tipo C — Permanecen como Client Components (100% interactivos)
Páginas que son **formularios de edición completos** donde prácticamente todo el contenido es interactivo.

- **`dashboard/settings/currencies/page.tsx`** — Formulario completo de selección de monedas con toggles, búsqueda, y radio buttons.
- **`dashboard/settings/payment-methods/page.tsx`** — CRUD de métodos de pago con editor de campos dinámicos.
- **`dashboard/organizations/[id]/settings/page.tsx`** — Formulario de edición de settings de una org.

### Tipo D — Layout con `usePathname` a migrar
- **`dashboard/settings/layout.tsx`** — Solo usa `usePathname()` para NavTabs. Se puede migrar a Server Component leyendo el pathname del request o usando un componente `NavTabs` que sea client.

---

## Plan de Migración Detallado

### Fase 1: Infraestructura — Capa de datos en servidor

Antes de migrar las páginas, se necesita una forma de hacer fetch de datos desde el servidor (Server Components no pueden usar `axios` con `withCredentials` porque no hay un navegador).

#### 1.1 Crear `lib/data/` — Funciones de data-fetching para servidor

Estas funciones usan `fetch` nativo de Node.js y reenvían las cookies de la petición entrante para autenticarse contra la API.

```
apps/console/lib/data/
├── organizations.ts      ← getOrganizations(), getOrganizationById()
├── platform-plans.ts     ← getPlans(), getPlansSummary()
├── platform-subscriptions.ts ← getSubscriptions(), getSubscriptionStats()
└── platform-settings.ts  ← getPlatformSettings()
```

**Patrón base:**
```typescript
// lib/data/organizations.ts
import { cookies } from 'next/headers';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export async function getOrganizations(params?: {
  query?: string;
  page?: number;
  limit?: number;
  includeMemberCount?: boolean;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const searchParams = new URLSearchParams();
  if (params?.query) searchParams.set('query', params.query);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.includeMemberCount) searchParams.set('includeMemberCount', 'true');

  const res = await fetch(
    `${API_BASE}/api/platform/organizations?${searchParams}`,
    { headers: { cookie: cookieHeader } }
  );

  if (!res.ok) throw new Error('Error al cargar organizaciones');
  return res.json();
}
```

> **Nota:** Los servicios existentes en `lib/services/` se mantienen para operaciones de escritura (POST/PATCH/DELETE) desde componentes cliente. Las funciones de `lib/data/` son solo para lecturas en Server Components.

---

### Fase 2: Migración de Páginas (Tipo A — Conversión Directa)

#### 2.1 `dashboard/page.tsx` — Dashboard Principal

**Antes:** `"use client"` → renderiza `<SaaSAdminDashboard>` que hace `useEffect` + `organizationsService.getAll()`.

**Después:**
```
dashboard/page.tsx (Server Component)
├── DashboardHeader (Server — HTML estático)
├── StatCard × 4 (Server — datos pre-calculados)
├── OrganizationModal ("use client" — solo el botón/modal)
└── OrganizationsList ("use client" — recibe initialData como prop)
```

**Archivos a modificar:**
- `dashboard/page.tsx` — Eliminar `"use client"`, hacer `async`, llamar `getOrganizations()`.
- `components/dashboard/saas-admin-dashboard.tsx` — Eliminar o refactorizar. La lógica se mueve a `page.tsx`.
- `components/dashboard/organizations-list.tsx` — Ya es `"use client"`, recibe datos como prop (no cambia).

---

#### 2.2 `dashboard/plans/page.tsx` — Planes de Plataforma

**Antes:** `"use client"` → `useEffect` → `platformPlansService.getAllWithStats()` + `.getSummary()`.

**Después:**
```
dashboard/plans/page.tsx (Server Component)
├── DashboardHeader + PlatformPlanModal ("use client")
├── StatCard × 4 (Server)
└── PlansList ("use client" — solo interacción: editar/eliminar plan)
```

**Archivos a modificar:**
- `dashboard/plans/page.tsx` — Eliminar `"use client"`, hacer `async`, llamar `getPlans()` + `getPlansSummary()`.
- Crear `dashboard/plans/plans-client.tsx` — Componente `"use client"` que recibe `initialPlans` y maneja los modales de editar/eliminar.

---

### Fase 3: Migración de Páginas (Tipo B — Server + Client Split)

#### 3.1 `dashboard/organizations/page.tsx` — Listado con Búsqueda/Paginación

**Antes:** Todo cliente. 11 estados con `useState`.

**Después:** Usar **searchParams en la URL** para búsqueda y paginación:

```
/dashboard/organizations                    → Página 1, sin filtro
/dashboard/organizations?query=power&page=2 → Búsqueda "power", página 2
```

```
dashboard/organizations/page.tsx (Server Component)
├── DashboardHeader + OrganizationModal ("use client")
├── Stats bar (Server — total de orgs)
├── OrganizationsSearch ("use client" — input de búsqueda que modifica URL)
├── Suspense fallback={<TableSkeleton />}
│   └── OrganizationsResults (Server async — carga datos filtrados)
│       ├── OrganizationsTable ("use client" — modales, acciones)
│       └── Pagination ("use client" — modifica URL)
└── PlatformSubscriptionModal ("use client" — modal global)
```

**Archivos a crear/modificar:**
- `dashboard/organizations/page.tsx` — Server Component con `searchParams`.
- Crear `dashboard/organizations/organizations-search.tsx` — Componente `"use client"` para el input de búsqueda con debounce que hace `router.push()`.
- Crear `dashboard/organizations/organizations-results.tsx` — Server async que hace `getOrganizations()` con los filtros.
- `components/dashboard/organizations-table.tsx` — Se mantiene `"use client"`, recibe datos como props (verificar que ya lo hace).

---

#### 3.2 `dashboard/subscriptions/page.tsx` — Suscripciones SaaS

**Antes:** `useQuery` + filtros de búsqueda/status/paginación en estado local.

**Después:** Similar a organizations. Estado en URL + Server Component para carga inicial + Suspense.

```
/dashboard/subscriptions?status=active&search=power&page=2
```

**Archivos a crear/modificar:**
- `dashboard/subscriptions/page.tsx` — Server Component.
- Crear `dashboard/subscriptions/subscriptions-client.tsx` — Barra de filtros + tabla interactiva.
- `components/platform/subscriptions-kpi-section.tsx` — Migrar KPIs a Server si es posible (o pasarlos como props).

---

#### 3.3 `dashboard/organizations/[id]/subscriptions/page.tsx` — Detalle Org Suscripciones

**Antes:** `useParams` + `useQuery` + paginación local.

**Después:**
```
[id]/subscriptions/page.tsx (Server Component)
├── Back button ("use client")
├── DashboardHeader (Server — nombre de la org cargado en servidor)
└── Suspense
    └── OrgSubscriptionsTable ("use client" — paginación)
```

---

### Fase 4: Migración de Layout

#### 4.1 `dashboard/settings/layout.tsx`

**Antes:** `"use client"` porque usa `usePathname()`.

**Después:** Extraer `NavTabs` como componente `"use client"` y el layout se convierte en Server Component:

```tsx
// dashboard/settings/layout.tsx (Server Component)
export default function PlatformSettingsLayout({ children }) {
  return (
    <div>
      <DashboardHeader ... />
      <SettingsNav /> {/* "use client" — usa usePathname internamente */}
      {children}
    </div>
  );
}
```

---

### Fase 5: Páginas Tipo C (Se mantienen como `"use client"`)

Estas páginas son formularios completos donde cada elemento es interactivo. **No se migran** pero se documentan:

| Página | Razón |
|:---|:---|
| `settings/currencies/page.tsx` | Formulario de selección/toggle de monedas con búsqueda, radio buttons, y guardado |
| `settings/payment-methods/page.tsx` | CRUD completo con modal editor de campos dinámicos |
| `organizations/[id]/settings/page.tsx` | Formulario de edición de settings |

> **Optimización futura:** Estas páginas podrían beneficiarse de cargar los `platformSettings` iniciales desde un Server Component padre y pasarlos como props, eliminando el flash de carga inicial. Pero la propia página permanece `"use client"`.

---

## Resumen de Archivos

### Nuevos
| Archivo | Propósito |
|:---|:---|
| `lib/data/organizations.ts` | Server-side data fetching de organizaciones |
| `lib/data/platform-plans.ts` | Server-side data fetching de planes |
| `lib/data/platform-subscriptions.ts` | Server-side data fetching de suscripciones + stats |
| `lib/data/platform-settings.ts` | Server-side data fetching de settings de plataforma |
| `dashboard/plans/plans-client.tsx` | Componente cliente para grid de planes con modales |
| `dashboard/organizations/organizations-search.tsx` | Input de búsqueda que modifica URL |
| `dashboard/organizations/organizations-results.tsx` | Server async con datos filtrados |
| `dashboard/subscriptions/subscriptions-client.tsx` | Filtros + tabla interactiva de suscripciones |
| `dashboard/organizations/[id]/subscriptions/org-subscriptions-client.tsx` | Tabla paginada del detalle |
| Archivos `error.tsx` por ruta | Error boundaries de Next.js |
| Archivos `loading.tsx` por ruta | Skeletons de carga nativos |

### Modificados
| Archivo | Cambio |
|:---|:---|
| `dashboard/page.tsx` | `"use client"` → Server Component |
| `dashboard/plans/page.tsx` | `"use client"` → Server Component |
| `dashboard/organizations/page.tsx` | `"use client"` → Server Component |
| `dashboard/subscriptions/page.tsx` | `"use client"` → Server Component |
| `dashboard/organizations/[id]/subscriptions/page.tsx` | `"use client"` → Server Component |
| `dashboard/settings/layout.tsx` | `"use client"` → Server Component (extraer NavTabs) |
| `components/dashboard/saas-admin-dashboard.tsx` | Posible eliminación (lógica se mueve a page.tsx) |

### Sin Cambios
| Archivo | Razón |
|:---|:---|
| `dashboard/layout.tsx` | Ya es Server Component ✅ |
| `dashboard/settings/page.tsx` | Ya es Server Component (redirect) ✅ |
| `dashboard/settings/currencies/page.tsx` | Formulario 100% interactivo |
| `dashboard/settings/payment-methods/page.tsx` | Formulario 100% interactivo |
| `dashboard/organizations/[id]/settings/page.tsx` | Formulario 100% interactivo |
| Todos los `lib/services/*.ts` | Se mantienen para mutaciones desde el cliente |
| Todos los `lib/hooks/*.ts` | Se mantienen para formularios cliente |

---

## Orden de Ejecución

1. **Fase 1:** Crear `lib/data/` con las funciones de fetching servidor.
2. **Fase 2:** Migrar `dashboard/page.tsx` y `dashboard/plans/page.tsx` (Tipo A — más simples).
3. **Fase 3:** Migrar `dashboard/organizations/page.tsx` y `dashboard/subscriptions/page.tsx` (Tipo B — requieren searchParams).
4. **Fase 4:** Migrar `dashboard/settings/layout.tsx` y `[id]/subscriptions/page.tsx`.
5. **Fase 5:** Agregar `error.tsx` y `loading.tsx` por ruta.

---

## Verificación

- [ ] Todas las páginas migradas renderizan correctamente sin `"use client"`.
- [ ] Los datos aparecen sin spinner/flash en la carga inicial.
- [ ] La búsqueda y paginación funcionan vía URL (`searchParams`).
- [ ] Los modales de crear/editar/eliminar siguen funcionando.
- [ ] Los formularios de settings (currencies, payment-methods, org settings) no tienen regresiones.
- [ ] El layout de settings funciona correctamente con NavTabs.
- [ ] No hay errores de hidratación (hydration mismatch).
- [ ] Build de producción (`pnpm build`) pasa sin errores.
