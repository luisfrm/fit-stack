# RBAC — Estructura actual

> Fuente vigente: `packages/shared/src/access-control.ts` + `AGENTS.md` § RBAC.

Sistema de permisos basado en **Better Auth Access Control** con matriz tipada. Sin strings hardcodeados: todo permiso se consulta vía `PERMISSION_MODULES` + `PERMISSION_ACTIONS`.

---

## Resumen

| Capa | Ubicación | Función |
|------|-----------|---------|
| Constantes | `@workspace/shared` | `PERMISSION_MODULES`, `PERMISSION_ACTIONS`, `ORG_ROLES` |
| Matriz | `access-control.ts` | `organizationAc.newRole(...)` / `platformAc.newRole(...)` |
| Cliente puro | `can(role, module, action)` | Lectura de matriz (`packages/shared/src/permissions/can.ts`) |
| API | `requireOrgPermission` / `requirePlatformPermission` | Middleware Hono que valida sesión + `can()` |
| Panel UX | `useOrgPermissions()` | `can(module, action)` |
| Anti-escalación | `canAssignRole(actor, target)` | Valida asignación de roles en miembros/staff |

**Coach y member no entran al Panel.** **Pagos** se autorizan vía módulo `subscriptions` (no existe módulo `payments`).

---

## Cómo funciona

Dos niveles de acceso, ambos definidos en `access-control.ts`:

1. **Plataforma** (`platformAc`): roles globales para el SaaS — `support`, `admin`, `owner`. Controlan `apps/console` y rutas `/api/platform/*`.
2. **Organización** (`organizationAc`): roles de tenant — `owner`, `manager`, `cashier`, `coach`, `member`. Controlan `apps/panel` y rutas org-scoped.

Cada rol es un `newRole({ modulo: [acciones] })`. La validación es `roleDef.authorize({ [modulo]: [accion] }).success` encapsulada en `can()`.

---

## Roles actuales

### Plataforma (SaaS)

| Rol | Alcance |
|-----|---------|
| `support` | Solo lectura (`console:access`, `organization:list`, `plan:list`, `subscription:list`, `user:list`, `setting:read`). No puede mutar nada. |
| `admin` | Crea/aprueba/suspende organizaciones, gestiona planes y settings (`setting:read/write`), `console:manage`. Entra a Console vía `console:access`. |
| `owner` | Todo lo de admin + `organization:delete`, `plan:delete`, `user:delete/impersonate`. |

Campo `user.role` guarda este rol. `console:access` habilita el layout; `console:manage` habilita las mutaciones (settings/branding/knowledge usan `setting:write`).

### Organización (tenant)

| Rol | Descripción |
|-----|-------------|
| `owner` | Control total del gym. Único que puede eliminar y asignar `owner`. |
| `manager` | Casi todo sin `delete`. No puede asignar `owner`. |
| `cashier` | Operación diaria: miembros/pagos/suscripciones/clases. Sin staff. |
| `coach` | Solo entrenamientos: `plans:read`, `classes:read/update`, `content:read`. |
| `member` | Cliente: `plans/classes/content:read` vía Portal. Sin Panel. |

---

## Matriz de permisos (Panel)

Fuente: `organizationRoles` en `access-control.ts`.

| Módulo | Owner | Manager | Cashier | Coach | Member |
|--------|:-----:|:-------:|:-------:|:-----:|:------:|
| **panel** (`access`) | ✅ | ✅ | ✅ | ❌ | ❌ |
| **dashboard** | ✅ read | ✅ read | ✅ read | ❌ | ❌ |
| **reports** | ✅ read | ✅ read | ✅ read | ❌ | ❌ |
| **members** | ✅ CRUD | ✅ R+C+U | ✅ R+C+U | ❌ | ❌ |
| **staff** | ✅ CRUD | ✅ R+C+U | ❌ | ❌ | ❌ |
| **subscriptions** | ✅ CRUD | ✅ R+C+U | ✅ R+C+U | ❌ | ❌ |
| **plans** | ✅ CRUD | ✅ R+C+U | ✅ read | ✅ read | ✅ read |
| **classes** | ✅ CRUD | ✅ R+C+U | ✅ R+C+U | ✅ R+U | ✅ read |
| **content** | ✅ CRUD | ✅ R+C+U | ❌ | ✅ read | ✅ read |
| **settings** | ✅ R+U | ✅ R+U | ✅ read | ❌ | ❌ |
| **organization** | ✅ R+U | ✅ R+U | ❌ | ❌ | ❌ |
| **ai** | ✅ read | ✅ read | ✅ read | ❌ | ❌ |

R=read, C=create, U=update, D=delete. `C+U` = sin `delete`.

**Regla anti-escalación** (`canAssignRole`):

| Actor | Puede asignar |
|-------|----------------|
| `owner` | todos |
| `manager` | `manager`, `cashier`, `coach`, `member` |
| `cashier` | solo `member` |

Validado server-side en `POST /api/members` y staff.

---

## Cómo validar

### API (api-worker)

```ts
import { requireOrgPermission, requirePlatformPermission } from "@/lib/route-handler";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "@workspace/shared";

// Org-scoped
.get("/", requireOrgPermission(PERMISSION_MODULES.MEMBERS, PERMISSION_ACTIONS.READ), async (c) => { ... })

// Plataforma (lectura)
.get("/", requirePlatformPermission("organization", "list"), async (c) => { ... })

// Plataforma (escritura)
.post("/", requirePlatformPermission("console", "manage"), zValidator("json", schema), async (c) => { ... })
```

Errores normalizados vía `onError` → `{ error, details? }`.

### Panel (UI)

```ts
import { useOrgPermissions } from "@workspace/auth/org";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "@workspace/shared";

const { can } = useOrgPermissions();

if (!can(PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)) redirect("/unauthorized");
can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE); // true para cashier/coach
```

`can()` es la única implementación (vive en `@workspace/shared`); el hook solo la envuelve con el `orgRole` de la sesión. En el servidor se usa `can` directamente.

### Console (UI)

`canPlatform(role, 'console', 'access')` gatea la entrada al layout y `/unauthorized`; las lecturas usan su módulo (`organization:list`, `plan:list`, `subscription:list`, `user:list`, `setting:read`) y las mutaciones `console:manage` (`setting:write` para settings, branding y knowledge). Todo deriva de `canPlatform()` en `@workspace/shared`; no hay comparaciones de rol hardcodeadas.

---

## Cómo agregar un nuevo rol o módulo

**Nuevo módulo** (ej. `routines` para PWA):
1. `packages/shared/src/permissions/modules.ts` → añadir `ROUTINES: "routines"` a `PERMISSION_MODULES`.
2. `packages/shared/src/access-control.ts` → añadir `routines: ["read","create","update","delete"]` a `organizationStatement`.
3. Asignar permisos por rol en `organizationRoles` (ej. `coach: { routines: ["read","create","update"] }`).
4. Usar `requireOrgPermission(PERMISSION_MODULES.ROUTINES, ...)` en rutas y `can(ROUTINES, ...)` en UI.

**Nuevo rol** (ej. `receptionist`):
1. `packages/shared/src/access-control.ts` → `receptionist: organizationAc.newRole({ panel: ["access"], members: ["read","create"], ... })`.
2. `packages/shared/src/constants.ts` → añadir a `ORG_ROLES`.
3. `packages/shared/src/permissions/role-assignment.ts` → actualizar `canAssignRole` si el rol puede asignar otros.
4. Validar en tests `apps/api-worker/tests/integration/guards.test.ts`.

---

## Archivos relacionados

```
packages/shared/src/
├── access-control.ts          # Matrices platformAc / organizationAc (fuente)
├── constants.ts               # ORG_ROLES, ORG_ROLE_LABELS
└── permissions/
    ├── modules.ts             # PERMISSION_MODULES
    ├── actions.ts             # PERMISSION_ACTIONS
    ├── can.ts                 # can(), canAny()
    ├── role-assignment.ts     # canAssignRole(), canAssignPlatformRole()
    └── index.ts

packages/auth/src/
├── org.tsx                    # useOrgAuth() (identidad) + useOrgPermissions() (can)
└── platform.ts                # usePlatformAuth() → user, platformRole

apps/api-worker/src/lib/
└── route-handler.ts           # requireOrgPermission, requirePlatformPermission, requireFeature

apps/panel/app/dashboard/
└── layout.tsx                 # guard can(PANEL, ACCESS) → /unauthorized
```

Ver también `AGENTS.md` § RBAC y § Features & Free Tier (`requireFeature` + `ai_chat`).
