# @workspace/shared

Tipos, DTOs, constantes y sistema de permisos compartidos entre backend y frontend. Single source of truth para interfaces y reglas de negocio.

---

## Entry Point

```ts
import { ORG_ROLES, platformRoles } from '@workspace/shared'
import type { IUser, IOrganization } from '@workspace/shared/types'
```

---

## Estructura

### `src/constants.ts`
- `ORG_ROLES` — `OWNER`, `MANAGER`, `CASHIER`, `COACH`, `MEMBER`
- `ORG_ROLE_LABELS` + `formatOrgRole(role)` — etiquetas en español para roles de **organización (Panel)**
- `PLATFORM_ROLE_LABELS` + `formatPlatformRole(role)` — etiquetas en español para roles de **plataforma (Console)**: `owner`, `admin`, `support`, `user`
- `PAYMENT_STATUSES` — `pending`, `processing`, `validated`, `invalid`, `voided`, `refunded`
- `SUBSCRIPTION_STATUSES` — `active`, `cancelled`, `expired`, `expiring`
- `PLATFORM_SUBSCRIPTION_STATUSES` — `active`, `trial`, `past_due`, `read_only`, `suspended`, `cancelled`
- `PLATFORM_GRACE_PERIODS` + `computePlatformSubscriptionStatus()` + `isPlatformSubscriptionActive()/Expired()` — helpers puros para el status de la suscripción SaaS
- `COUNTRIES` — 8 países preconfigurados: VE, CO, MX, AR, CL, PE, ES, US + interfaz `ICountryConfig`

### `types.ts`

- `IUser`, `ISession`, `IAuthMember`, `IOrganization`, `ICmsClass`, `IMember`
- `MemberFilter`, `PaginatedMembers`, `IAuthError`, `TrendDirection`
- `FrequencyType`, `PlanFeatures`, `IPlatformOrganization`

### `access-control.ts`

- `platformStatement`/`platformAc`/`platformRoles` — AC de plataforma SaaS (roles: `owner`, `admin`, `support`)
- `canAccessConsole(role)` — gate de acceso al Console (true para cualquier rol de `platformRoles`)
- `organizationStatement`/`organizationAc`/`organizationRoles` — AC de tenant (roles: `owner`, `manager`, `cashier`, `coach`, `member`)
- `orgRoleDefinitions` — alias de `organizationRoles` (mapa Better Auth de rol → permisos nativos)

### `auth-config.ts`

- `ORGANIZATION_ADDITIONAL_FIELDS` — campos extra de `organization` en Better Auth: `slogan`, `countryCode`, `taxId`, `legalName`, `address`, `fiscalConfig`, `timezone`, `status`

### `permissions/`

| File | Contents |
|------|----------|
| `modules.ts` | `PERMISSION_MODULES` (11 módulos: dashboard, reports, members, staff, subscriptions, plans, classes, content, settings, organization, panel) + `PERMISSION_MODULE_VALUES` |
| `actions.ts` | `PERMISSION_ACTIONS` (READ, CREATE, UPDATE, DELETE, ACCESS) |
| `can.ts` | `can(role, module, action)`, `canAny(role, checks)`, `hasAccess` (alias de `can`) |
| `role-assignment.ts` | `canAssignRole(actor, target)` (org) y `canAssignPlatformRole(actor, target)` (plataforma) — anti-escalation |
| `index.ts` | Re-export del módulo `permissions` |

> La matriz de permisos vive en `access-control.ts` (`organizationRoles` con `organizationAc.newRole(...)`), no en un archivo de matriz separado. `can()` evalúa contra `organizationRoles`.

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