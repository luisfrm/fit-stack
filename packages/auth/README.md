# @workspace/auth

Capa compartida de autenticación cliente (Better Auth). Contiene el cliente, hooks de React y un servicio de sesión que funciona tanto en cliente como en servidor.

---

## Entry Points

| Import path | Contents |
|-------------|----------|
| `@workspace/auth` | Re-exporta todo: client, service, hooks, permissions y constantes de `@workspace/shared` |
| `@workspace/auth/client` | `authClient`, `useSession`, `useActiveOrganization`, `organization` |
| `@workspace/auth/service` | `sessionService` (getSession, signIn, signUp) |
| `@workspace/auth/hooks` | `useAuth()` — hook con role flags (`isOwner`, `isManager`, etc.) |
| `@workspace/auth/permissions` | `usePermissions()` — `can(module, action)`, `canAccessCms()` |

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
import { authClient, useActiveOrganization } from '@workspace/auth/client'

// Cambiar organización activa
await authClient.organization.setActive({ organizationId: 'org_123' })

// Leer org activa
const { data: org } = useActiveOrganization()
```

---

## Convenciones

- **Siempre** usar `useAuth()` en UI. **Nunca** `useSession()` o `useActiveOrganization()` directamente.
- Para server components: `sessionService.getSession()` con headers de la request.
- Los archivos `apps/*/lib/auth-client.ts` re-exportan este paquete para centralización.

---

## Dependencias

- `better-auth` ^1.5.5
- `@workspace/shared` (para tipos y constantes)