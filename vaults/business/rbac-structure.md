# RBAC — estructura del código

> Fuente vigente: `packages/shared/src/access-control.ts`. Reglas y matriz: [`rbac.md`](./rbac.md); middleware: `AGENTS.md` §6.

Permisos con **Better Auth Access Control**. Sin strings hardcodeados: todo permiso se consulta con `PERMISSION_MODULES` + `PERMISSION_ACTIONS`.

## Capas

| Capa | Ubicación | Función |
|---|---|---|
| Constantes | `@workspace/shared` | `PERMISSION_MODULES`, `PERMISSION_ACTIONS`, `ORG_ROLES` |
| Matriz | `access-control.ts` | `organizationAc.newRole(...)` / `platformAc.newRole(...)` |
| Cliente puro | `can(role, module, action)` | Lectura de la matriz (`packages/shared/src/permissions/can.ts`) |
| API | `requireOrgPermission` / `requirePlatformPermission` | Middleware Hono: sesión + `can()` |
| Panel UX | `useOrgPermissions()` | `can(module, action)` |
| Anti-escalación | `canAssignRole(actor, target)` | Valida la asignación de roles |

**Coach y member no entran al Panel.** **Pagos** se autorizan con el módulo `subscriptions` (no existe un módulo `payments`).

## Cómo funciona

Dos niveles, ambos en `access-control.ts`:

1. **Plataforma** (`platformAc`): roles globales del SaaS — `support`, `admin`, `owner`. Controlan `apps/console` y `/api/platform/*`.
2. **Organización** (`organizationAc`): roles del tenant — `owner`, `manager`, `cashier`, `coach`, `member`. Controlan `apps/panel` y las rutas org-scoped.

Cada rol es un `newRole({ modulo: [acciones] })`. La validación es `roleDef.authorize({ [modulo]: [accion] }).success`, encapsulada en `can()`.

## Roles

### Plataforma

| Rol | Alcance |
|---|---|
| `support` | Solo lectura (`console:access`, `organization:list`, `plan:list`, `subscription:list`, `user:list`, `setting:read`) |
| `admin` | Organizaciones, planes, settings (`setting:read/write`) y `console:manage`. Entra por `console:access` |
| `owner` | Todo lo de admin + `organization:delete`, `plan:delete`, `user:delete/impersonate` |

`console:access` habilita el layout; `console:manage` habilita las mutaciones (settings, branding y knowledge usan `setting:write`). El campo `user.role` guarda este rol.

### Organización

| Rol | Descripción |
|---|---|
| `owner` | Control total del gym. Único que elimina y que asigna `owner` |
| `manager` | Casi todo sin `delete`. No asigna `owner` |
| `cashier` | Operación diaria: miembros, pagos, suscripciones, clases. Sin staff |
| `coach` | Solo entrenamientos: `plans:read`, `classes:read/update`, `content:read` |
| `member` | Cliente: `plans/classes/content:read` en el Portal. Sin Panel |

La matriz por módulo y la regla anti-escalación viven en [`rbac.md`](./rbac.md) (misma fuente, sin copia).

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

Los errores pasan por `onError` → `{ error, details? }`.

### Panel (UI)

```ts
import { useOrgPermissions } from "@workspace/auth/org";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "@workspace/shared";

const { can } = useOrgPermissions();

if (!can(PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)) redirect("/unauthorized");
can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE); // true para cashier/coach
```

`can()` es la única implementación (en `@workspace/shared`); el hook solo la envuelve con el `orgRole` de la sesión. En el servidor se usa `can` directamente.

### Console (UI)

`canPlatform(role, 'console', 'access')` gatea el layout y `/unauthorized`; las lecturas usan su módulo y las mutaciones `console:manage`. Todo deriva de `canPlatform()` en `@workspace/shared`: no hay comparaciones de rol hardcodeadas.

## Cómo agregar un módulo o un rol

**Módulo nuevo** (ej. `routines`):

1. `packages/shared/src/permissions/modules.ts` → añadir `ROUTINES: "routines"` a `PERMISSION_MODULES`.
2. `packages/shared/src/access-control.ts` → añadir `routines: ["read","create","update","delete"]` a `organizationStatement`.
3. Asignar permisos por rol en `organizationRoles`.
4. Usar `requireOrgPermission(PERMISSION_MODULES.ROUTINES, ...)` en rutas y `can(ROUTINES, ...)` en UI.

**Rol nuevo** (ej. `receptionist`):

1. `packages/shared/src/access-control.ts` → `receptionist: organizationAc.newRole({ panel: ["access"], members: ["read","create"], ... })`.
2. `packages/shared/src/constants.ts` → añadir a `ORG_ROLES`.
3. `packages/shared/src/permissions/role-assignment.ts` → actualizar `canAssignRole` si puede asignar otros roles.
4. Validar en `apps/api-worker/tests/integration/guards.test.ts`.

## Archivos

```
packages/shared/src/
├── access-control.ts          # Matrices platformAc / organizationAc
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

apps/panel/app/(protected)/
└── layout.tsx                 # guard can(PANEL, ACCESS) → /unauthorized
```

Ver también `AGENTS.md` §5–§6 y [`features-and-free-tier.md`](./features-and-free-tier.md) (`requireFeature` + `ai_chat`).
