# @workspace/shared

Tipos, DTOs, constantes y sistema de permisos compartidos entre backend y frontend. Single source of truth para interfaces y reglas de negocio.

---

## Entry Point

```ts
import { GLOBAL_ROLES, ORG_ROLES } from '@workspace/shared'
import type { IUser, IOrganization } from '@workspace/shared/types'
```

---

## Estructura

### `src/constants.ts`
- `GLOBAL_ROLES` — `ADMIN` (`admin`), `USER` (`user`)
- `ORG_ROLES` — `OWNER`, `MANAGER`, `CASHIER`, `COACH`, `MEMBER`
- `PAYMENT_STATUSES` — `processing`, `validated`, `invalid`, `voided`
- `SUBSCRIPTION_STATUSES` — `active`, `cancelled`, `expired`, `expiring`
- `PLATFORM_SUBSCRIPTION_STATUSES` — `active`, `past_due`, `read_only`, `suspended`, `cancelled`
- `COUNTRIES` — 8 países preconfigurados: VE, CO, MX, AR, CL, PE, ES, US + interfaz `ICountryConfig`

### `types.ts`

- `IUser`, `ISession`, `IAuthMember`, `IOrganization`, `ICmsClass`, `IMember`
- `MemberFilter`, `PaginatedMembers`, `IAuthError`, `TrendDirection`
- `FrequencyType`, `PlanFeatures`, `IPlatformOrganization`

### `access-control.ts`

- `statement`, `ac` (Better Auth `createAccessControl`)
- Roles: `owner`, `manager`, `cashier`, `coach`, `member`
- `orgRoleDefinitions` — mapa Better Auth de rol → permisos nativos

### `auth-config.ts`

- `ORGANIZATION_ADDITIONAL_FIELDS` — campos extra de `organization` en Better Auth: `slogan`, `countryCode`, `taxId`, `legalName`, `address`, `fiscalConfig`, `timezone`, `status`

### `permissions/`

| File | Contents |
|------|----------|
| `modules.ts` | `PERMISSION_MODULES` (10 módulos: dashboard, reports, members, staff, subscriptions, plans, classes, content, settings, organization) |
| `actions.ts` | `PERMISSION_ACTIONS` (READ, CREATE, UPDATE, DELETE) |
| `matrix-helpers.ts` | `PERMISSION_PRESETS` (NONE, READ, READ_UPDATE, READ_CREATE_UPDATE, CRUD), tipos `OrgPermissions`, `ModulePermissions` |
| `matrix.ts` | `ORG_ROLE_PERMISSIONS` — matriz owner/manager/cashier/coach/member |
| `can.ts` | `can(role, module, action)`, `canAny(role, checks)` |
| `cms-access.ts` | `CMS_ALLOWED_ORG_ROLES`, `canAccessCms(role)` |
| `role-assignment.ts` | `canAssignRole(actor, target)` — anti-escalation |

---

## Uso típico

```ts
// Verificar permiso
import { can, PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'
const allowed = can('cashier', PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)

// Anti-escalation
import { canAssignRole } from '@workspace/shared'
canAssignRole('manager', 'owner') // → false

// País por defecto
import { COUNTRIES, DEFAULT_COUNTRY } from '@workspace/shared'
COUNTRIES.VE.name // → "Venezuela"
```

---

## Dependencias

- `better-auth` (solo para tipos `Role` en `access-control.ts`)