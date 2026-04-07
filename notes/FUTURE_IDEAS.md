# 🚀 Ideas Futuras y Mejoras de Fit-Stack

Este documento recopila las funcionalidades y mejoras arquitectónicas planificadas para fases posteriores, una vez que el core del sistema sea estable.

---

## 🖥️ 1. App de Escritorio (Tauri)
Transformar el CMS en una aplicación nativa para Windows/macOS/Linux.

### Beneficios
- **Acceso Directo**: Icono en el escritorio para Admins y Managers.
- **Rendimiento**: Ejecución más fluida mediante WebView2 (Edge) sin la carga de un navegador completo.
- **Integración de Hardware**: Comunicación directa con torniquetes y cámaras biométricas (en enlace con el Bridge de Python).

### Detalles Técnicos y Código Base
Para evitar conflictos con el CMS en la web (Vercel), usaremos una **Configuración Condicional** en `next.config.mjs`:

```javascript
// apps/cms/next.config.mjs
const isTauri = process.env.TAURI_PLATFORM !== undefined;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Solo aplicamos 'export' si estamos compilando para escritorio
  output: isTauri ? 'export' : undefined,
  
  // Las imágenes deben ser unoptimized en escritorio (no hay servidor Node)
  images: {
    unoptimized: isTauri,
  },
  
  // Opcional: Impedir que Tauri intente usar el backend de Next.js
  assetPrefix: isTauri ? '' : undefined,
}
export default nextConfig;
```

### Autenticación (Better Auth + Cookies)
Para que las sesiones funcionen en el `.exe`, integraremos el plugin nativo de HTTP de Tauri en el cliente de auth:

```typescript
// apps/cms/lib/auth-client.ts
import { createAuthClient } from "better-auth/client"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"

const isTauri = typeof window !== "undefined" && window.__TAURI_INTERNALS__ !== undefined;

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    fetchOptions: {
        // En escritorio usamos el fetch nativo para manejar Cookies HttpOnly correctamente
        customFetch: isTauri ? tauriFetch : undefined 
    }
})
```

### Comandos de Desarrollo
Se añadirán estos scripts al `package.json` de `apps/cms`:
- `npm run tauri dev`: Abre la ventana de escritorio en modo desarrollo.
- `npm run tauri build`: Genera el instalador `.exe` (MSI) optimizado.

---

## ⚡ 2. Optimizaciones de Red y Offline
- **SWR / React Query**: Implementar estrategias de cacheo agresivas para que los listados de miembros carguen instantáneamente.
- **Modo Offline Crítico**: Permitir que el Bridge registre accesos localmente aunque el servidor de Fit-Stack esté caído, sincronizando los logs al recuperar la conexión.

---

## 📊 3. Dashboard Pro / Analíticas
- **Reportes en PDF**: Generación de reportes de asistencia y pagos directamente desde la app.
- **Heatmaps**: Visualización de las horas de mayor afluencia en el gimnasio mediante los datos de control de acceso.

---

## 🛠️ 4. Estabilización del Schema (Actual)
- [ ] Refactorizar tipos redundantes en `packages/database`.
- [ ] Asegurar que las migraciones de Drizzle sean 100% compatibles con Neon DB.
