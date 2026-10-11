---
description: Revisa la feature actual con Playwright CLI. Mide funcionalidad, no estilos.
agent: build
model: opencode-go/longcat-2.5-preview-free
---

Revisa funcionalmente la feature indicada en `$ARGUMENTS` (o inferida del `git diff`) usando Playwright CLI. No edites archivos.

## Pasos

**1. Descubre qué cambió**

```bash
git diff --stat HEAD
git status --short
```

Si `$ARGUMENTS` trae una ruta (ej. `/dashboard/members`), úsala. Si no, infiere la ruta desde los archivos modificados.

**2. Verifica que los servidores estén corriendo**

```bash
curl -sf http://localhost:3001 > /dev/null && echo "panel OK" || echo "panel DOWN"
curl -sf http://localhost:8788/healthz > /dev/null && echo "api OK" || echo "api DOWN"
```

Si alguno está caído, detente y avisa. No los inicies.

**3. Toma un screenshot inicial**

```bash
pnpx playwright screenshot --browser=chromium --full-page \
  "http://localhost:3001<ruta>" /tmp/review-ui.png
```

**4. Verifica los flujos funcionales**

- ¿Carga la página sin errores de consola?
- ¿Los formularios envían y reciben respuesta correcta?
- ¿Las acciones CRUD se reflejan en la UI sin recarga manual?
- ¿Los estados vacío, error y carga son visibles?
- ¿La navegación entre rutas relacionadas funciona?

Si hay tests E2E en `e2e/panel/` o `e2e/console/` que cubran la feature, córrelos:

```bash
pnpx playwright test --browser=chromium --project=panel --reporter=list
```

**5. Reporta en español, breve**

- **Veredicto**: `APROBADO` o `CAMBIOS SOLICITADOS`.
- **Ruta revisada**.
- **Hallazgos** (`blocker` | `major` | `minor` | `nit`): acción o selector — qué falla — por qué importa — arreglo esperado.
- **Pendientes**: lo que no se pudo verificar.
