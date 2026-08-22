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

---

## 🤖 5. IA — Créditos, RAG y Escalabilidad (post-créditos 2026-08)

> Migración a créditos completada (`ai_credits_monthly`, `ai_usage.credits`). Lo de abajo son **ideas no comprometidas** — ver `PENDING.md` § 6 para los follow-ups comprometidos (packs Stripe, RAG). Docs vigentes: `CHAT_PRICING.md`, `CHAT_INFRASTRUCTURE.md`.

- **Durable Objects si tools lo exige:** hoy `ai.service` es stateless (SSE + `include_usage` + `ctx.waitUntil(settle)`). Si se añaden tools con estado (memoria de sesión, tool chaining largo, streaming multi-turn con `maxToolOutputTokens: 2_048`), evaluar **Cloudflare Durable Objects** para coordinar estado por `organizationId`/`sessionId` y evitar carreras en `settleAiCredits`. No necesario mientras los tools sean idempotentes y el ledger siga en `ai_usage` (upsert atómico).
- **RAG Fase 1 completado:** `@cf/baai/bge-m3` + pgvector (tablas `ai_knowledge_document`/`ai_knowledge_chunk`, Console → Base de Conocimiento). Siguiente: Fase 2 con datos vivos por org + KB panel. Como idea futura: re-ranking, embeddings por idioma (ES/PT), cache de retrieval por hash y facturación 1 crédito/1K emb.
- **Packs auto-refill / overage:** alternativa a packs fijos — auto-compra de 1K créditos al agotar cuota (con cap diario `AI_CREDIT_CONSTANTS.dailyCapFraction = 0.2` para evitar quemar el mes en un día). Requiere Stripe + guard de gasto en `features.service`.
- **Modelos por org / pricing dinámico:** `creditMultiplier` por modelo en `shared/ai.ts` hoy es `1.0` para GLM y `openrouter/free`; a futuro cada modelo podría tener multiplicador (ej. razonamiento ×2) sin tocar el ledger. Panel: selector por org con coste preview.
- **Observabilidad de créditos:** dashboard de consumo por org (créditos/día, top prompts truncados, ratio in/out), alertas a 80%/100% vía Queue + email (jobs-worker), y export CSV para el SaaS admin.
- **Ideas descartadas del modelo por mensajes:** límites `ai_messages_daily/weekly/monthly` y planes por mensajes (30 msgs/día) — reemplazados por `ai_credits_monthly`. Se conservan en `CHAT_IMPLEMENTATION.MD` (⏸ DEPRECATED) solo como historial.
