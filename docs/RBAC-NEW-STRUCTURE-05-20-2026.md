# RBAC — Nueva estructura (20 mayo 2026)

Implementación del sistema de permisos basado en matriz JSON tipada, sin strings hardcodeados en aplicación.

## Resumen

| Capa | Ubicación | Función |
|------|-----------|---------|
| Constantes | `@workspace/shared` | `PERMISSION_MODULES`, `PERMISSION_ACTIONS`, `ORG_ROLES` |
| Matriz | `ORG_ROLE_PERMISSIONS` | Rol → módulo → acción (`boolean`) |
| Cliente puro | `can(role, module, action)` | Lectura de matriz |
| API | `authorize(session, orgId, module, action)` | Sesión + org activa + `can()` |
| CMS UX | `usePermissions()` | `can(module, action)` con `orgRole` de sesión |
| Anti-escalación | `canAssignRole(actor, target)` | Al asignar roles en staff/miembros |
| Acceso CMS | `canAccessCms(role)` | Solo `owner`, `manager`, `cashier` |

**Coach y member** no entran al CMS (PWA futura). **Pagos** van bajo el módulo `subscriptions` (no existe módulo `payments`).

---

## Archivos creados

```
packages/shared/src/permissions/
├── actions.ts           # PERMISSION_ACTIONS
├── modules.ts           # PERMISSION_MODULES
├── matrix-helpers.ts    # PERMISSION_PRESETS, tipos
├── matrix.ts            # ORG_ROLE_PERMISSIONS
├── can.ts               # can(), canAny()
├── role-assignment.ts   # canAssignRole()
├── cms-access.ts        # CMS_ALLOWED_ORG_ROLES, canAccessCms()
└── index.ts
```

## Archivos modificados principales

- `packages/shared/src/index.ts` — export permissions
- `packages/shared/src/access-control.ts` — roles Better Auth alineados (sin `adminAc` completo en manager)
- `apps/api/config/auth-utils.ts` — `authorize()`, `authorizeUpload()`, `requireGlobalAdmin()`
- `packages/auth/src/permissions.ts` + `hooks.ts` — `usePermissions()`
- ~30 route handlers en `apps/api/app/api/**` — `authorize()` por módulo/acción
- `apps/cms/app/dashboard/layout.tsx` — guard `canAccessCms`
- `apps/cms/components/dashboard/dashboard-ui.tsx` — sidebar filtrado por permisos
- `apps/cms/components/payments/subscriptions-table.tsx` — `can(SUBSCRIPTIONS, DELETE)`
- `apps/cms/components/staff/staff-form.tsx` — opciones de rol filtradas

## Archivos eliminados

- `apps/api/app/api/users/route.ts` (sin consumidores; no relacionado con `/api/init`)
- `apps/api/services/users.service.ts`

Se mantiene `apps/api/repositories/users.repository.ts` (usado por `members.service`).

---

## Uso en código

### Shared / tipos

```ts
import {
  ORG_ROLES,
  PERMISSION_MODULES,
  PERMISSION_ACTIONS,
  can,
} from "@workspace/shared";

can(ORG_ROLES.CASHIER, PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE); // true
```

### API (route handler)

```ts
import { authorize } from "@/config/auth-utils";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "@workspace/shared";

if (!authorize(session, organizationId, PERMISSION_MODULES.SUBSCRIPTIONS, PERMISSION_ACTIONS.CREATE)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### CMS (UI)

```ts
import { usePermissions } from "@/lib/hooks/use-auth";
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from "@workspace/shared";

const { can } = usePermissions();
can(PERMISSION_MODULES.PLANS, PERMISSION_ACTIONS.CREATE); // false para cashier
```

---

## Matriz CMS (owner / manager / cashier)

| Módulo | Owner | Manager | Cashier |
|--------|:-----:|:-------:|:-------:|
| dashboard | read | read | read |
| reports | read | read | read |
| members | CRUD | CRUD | CRUD |
| staff | CRUD | CRUD | — |
| subscriptions | CRUD | R+C+U (sin delete) | R+C+U |
| plans | CRUD | CRUD | read |
| classes | CRUD | CRUD | R+C+U |
| content | CRUD | CRUD | — |
| settings | R+U | R+U | read |
| organization | R+U | R+U | — |

Leyenda: R=read, C=create, U=update, D=delete.

**Cancelar suscripción** (`PUT` status `cancelled` o `DELETE`) requiere `subscriptions` + `delete` (solo owner).

**Cashier** tiene `settings.read` para moneda/métodos de pago al registrar cobros (sin editar configuración).

---

## Reglas de asignación de roles

| Actor | Puede asignar |
|-------|----------------|
| owner | Todos los `ORG_ROLES` |
| manager | manager, cashier, coach, member (no owner) |
| cashier | Solo `member` (clientes) |

Validado en `POST/PUT /api/members` y en `staff-form` (UI).

---

## Mapeo endpoint → permiso

| Endpoint | Módulo | Acción |
|----------|--------|--------|
| GET/POST `/members` (clientes) | members | read / create |
| GET `/members?excludeRole=member` | staff | read |
| PUT/DELETE `/members/[id]` | members o staff | update/delete (según rol del registro) |
| GET/POST `/subscriptions` | subscriptions | read / create |
| PUT cancel / DELETE `/subscriptions/[id]` | subscriptions | delete |
| POST `/payments/[id]/status` | subscriptions | update |
| GET `/payments/analytics`, `/reports/revenue` | reports | read |
| GET `/dashboard/stats` | dashboard | read |
| GET/POST `/plans`, PUT/DELETE `/plans/[id]` | plans | según método |
| GET/POST `/classes`, `/classes/[id]` | classes | según método |
| GET/POST `/coaches` | staff | read / create |
| `cms/*`, upload (contenido) | content | según método |
| upload (avatares) | content.create **o** members.update | `authorizeUpload()` |
| GET/POST `/settings` | settings | read / update |
| GET/PATCH `/platform/organizations/[id]` | organization | read / update |
| `/api/platform/*` (resto) | — | `requireGlobalAdmin()` |
| GET `/members/me` | — | cualquier miembro autenticado en la org |

---

## Plataforma vs tenant

- **`GLOBAL_ROLES.ADMIN`**: rutas `/api/platform/*`, settings globales sin org activa.
- **Sin bypass**: un admin global en el CMS sigue limitado por `ORG_ROLE_PERMISSIONS` de su `member.role` en la org activa.

---

## Pendiente / fase siguiente

- [ ] Módulos PWA (`routines`, `workouts`, …) para coach/member
- [ ] Guards en páginas CMS individuales (botones crear/editar en members, plans, etc.)
- [ ] Filtrar sub-nav de settings por `settings.update`
- [ ] Tests automatizados de matriz

---

## Verificación manual sugerida

1. **Cashier**: crear cliente + suscripción ✅; cancelar suscripción ❌ 403; settings solo lectura; sin staff/content.
2. **Manager**: cancelar suscripción ✅; no puede asignar rol owner.
3. **Coach/member**: redirect `/unauthorized` al entrar al dashboard.
4. **Owner**: acceso completo CMS.
