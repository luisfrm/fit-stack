# @workspace/auth

Capa compartida de autenticación cliente (Better Auth). Contiene el cliente, hooks de React y un servicio de sesión que funciona tanto en cliente como en servidor.

---

## Entry Points

| Import path | Contents |
|-------------|----------|
| `@workspace/auth` | Re-exporta todo: client, service, hooks, permissions y constantes de `@workspace/shared` |
| `@workspace/auth/client` | `authClient`, `useSession`, `organization` |
| `@workspace/auth/service` | `sessionService` (getSession, signIn, signUp) |
| `@workspace/auth/hooks` | `useAuth()` — hook con role flags (`isOwner`, `isManager`, etc.) |
| `@workspace/auth/permissions` | `usePermissions()` — `can(module, action)`, `canAccessCms()` |
| `@workspace/auth/api-client` | `createApiClient()` — cliente HTTP del API de Fit-Stack compartido por panel y console |

---

## Uso

### Cliente React

```tsx
import { useAuth, usePermissions } from '@workspace/auth/hooks'
import { PERMISSION_MODULES, PERMISSION_ACTIONS } from '@workspace/shared'

function MyComponent() {
  const { isOwner, isManager, orgRole } = useAuth()
  const { can } = usePermissions()

  const canEdit = can(PERMISSION_MODULES.CLASSES, PERMISSION_ACTIONS.UPDATE)

  if (isOwner) return <AdminPanel />
  return <ReadOnlyView />
}
```

### Servidor (Next.js Server Component / API)

```tsx
import { sessionService } from '@workspace/auth/service'

export default async function Page() {
  const { data: session, error } = await sessionService.getSession()
  if (!session) return <LoginPrompt />
  return <div>Hola {session.user.name}</div>
}
```

### Cliente raw

```tsx
import { authClient } from '@workspace/auth/client'
import { useAuth } from '@workspace/auth/hooks'

// Leer org activa (objeto completo, resuelto por el customSession del api-worker)
const { activeOrganization } = useAuth()

// Cambiar organización activa
await authClient.organization.setActive({ organizationId: 'org_123' })
```

### Cliente del API (panel / console)

```ts
// apps/*/lib/api/client.ts — única instancia por app
import { createApiClient } from '@workspace/auth/api-client'

const { api, apiBlob } = createApiClient({
  onOrganizationNotFound: () => window.dispatchEvent(new Event(ORG_CONTEXT_LOST_EVENT)),
})

export { api, apiBlob }
export type { ApiFetchOptions } from '@workspace/auth/api-client'
```

El cliente reutiliza `requireApiBaseUrl()` (este paquete), reenvía cookies en el
servidor y formatea errores de validación. `ORG_CONTEXT_LOST_EVENT` lo escucha
`<OrgContextGuard>`, que navega con `router.replace('/reset-org-context')`.

---

## Convenciones

- **Siempre** usar `useAuth()` en UI — expone `activeOrganization` y los role flags. **Nunca** `useSession()` directamente.
- Para server components: `sessionService.getSession()` con headers de la request.
- No crear re-exports locales en `apps/*/lib`: importar directo de `@workspace/auth/*`.

---

## Dependencias

- `better-auth` ^1.5.5
- `@workspace/shared` (para tipos y constantes)