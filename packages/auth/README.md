# @workspace/auth

Capa compartida de autenticación cliente (Better Auth). Contiene el cliente, el servicio de sesión, el cliente HTTP del API y los hooks separados por carril: **org** (tenant) y **platform** (SaaS).

---

## Entry Points

| Import path | Contents |
|-------------|----------|
| `@workspace/auth` | Client + service + constantes de `@workspace/shared` |
| `@workspace/auth/client` | `authClient`, `useSession`, `organization` |
| `@workspace/auth/service` | `sessionService` (getSession, signIn, signUp) |
| `@workspace/auth/org` | **Tenant:** `useOrgAuth()` (identidad) + `useOrgPermissions()` (autorización) |
| `@workspace/auth/platform` | **SaaS:** `usePlatformAuth()` (usuario + rol de plataforma) |
| `@workspace/auth/env` | `requireEnvValue()` / `requireApiBaseUrl()` |
| `@workspace/auth/api-client` | `createApiClient()` — cliente HTTP del API de Fit-Stack |

---

## Uso

### Organización (Panel y futuras apps de gimnasio)

```tsx
import { useOrgAuth, useOrgPermissions } from '@workspace/auth/org'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'

function MyComponent() {
  const { isOwner } = useOrgAuth()
  const { can } = useOrgPermissions()

  // Authorization always goes through the matrix: owner, manager and cashier pass.
  const canAccess = can(PERMISSION_MODULES.PANEL, PERMISSION_ACTIONS.ACCESS)
  const canEdit = can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)

  if (!canAccess) return <AccessDenied />

  return (
    <>
      {isOwner && <OwnerBadge />} {/* identity only: never an authorization gate */}
      {canEdit ? <EditView /> : <ReadOnlyView />}
    </>
  )
}
```

> Los flags (`isOwner`, `isManager`, …) son **identidad** (etiquetas, badges, copy).
> Nunca autorizan: rutas, módulos y botones se deciden con `can(module, action)`.

### Plataforma (Console)

```tsx
import { usePlatformAuth } from '@workspace/auth/platform'
import { canAssignPlatformRole, platformRoles, type PlatformRole } from '@workspace/shared'

function StaffTable() {
  const { platformRole } = usePlatformAuth()

  // Roles this actor may assign (anti-escalation): admin can assign admin/support, never owner.
  const assignableRoles = Object.keys(platformRoles).filter((role) =>
    canAssignPlatformRole(platformRole, role as PlatformRole),
  )
}
```

> `canPlatform(role, module, action)` responde "¿puede ejecutar esta acción?" y **no** sustituye a
> `canAssignPlatformRole(actorRole, targetRole)`: un `admin` tiene `user:set-role` pero no puede asignar `owner`.

`usePlatformAuth` no devuelve campos de organización: la Console es platform-scoped.

### Servidor (Next.js Server Component / API)

```tsx
import { sessionService } from '@workspace/auth/service'

export default async function Page() {
  const { data: session, error } = await sessionService.getSession()
  if (!session) return <LoginPrompt />
  return <div>Hola {session.user.name}</div>
}
```

### Cliente del API (panel / console)

```ts
// apps/*/lib/api/client.ts — única instancia por app
import { createApiClient } from '@workspace/auth/api-client'

const { api, apiBlob } = createApiClient()

export { api, apiBlob }
export type { ApiFetchOptions } from '@workspace/auth/api-client'
```

El cliente reutiliza `requireApiBaseUrl()`, reenvía cookies en el servidor y formatea
errores de validación.

---

## Convenciones

- **Org vs platform:** `useOrgAuth`/`useOrgPermissions` para apps de gimnasio; `usePlatformAuth` para la Console. No mezclar campos de un carril en el otro.
- **Identidad vs autorización:** los flags no autorizan; `can()` / `canPlatform()` sí.
- Para server components: `sessionService.getSession()` con headers de la request.
- No crear re-exports locales en `apps/*/lib`: importar directo de `@workspace/auth/*`.

---

## Dependencias

- `better-auth` ^1.7.14
- `ofetch` (cliente HTTP)
- `@workspace/shared` (tipos, constantes y matriz de permisos)
- `next` (peer dependency: `next/headers`)
