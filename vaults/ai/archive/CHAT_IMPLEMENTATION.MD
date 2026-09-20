> [!CAUTION]
> **⏸ DEPRECATED — 21 de agosto de 2026 — No usar como referencia vigente**
>
> Este documento describe el **modelo antiguo por mensajes** (30 msgs/día, planes $3/$10/$35, `max_tokens: 800` suelto) y queda **archivado como referencia histórica**. La plataforma migró a **créditos** (`1 crédito = 1K tokens ×1.0`, cuota `ai_credits_monthly`).
>
> **Fuentes vigentes:**
> - [`CHAT_PRICING.md`](./CHAT_PRICING.md) — unidad, fórmula, planes Básico/Standard/Premium, free tier 500cr, packs fijos, límites `AI_CHAT_LIMITS`.
> - [`CHAT_INFRASTRUCTURE.md`](./CHAT_INFRASTRUCTURE.md) — router `openrouter ↔ workers-ai`, ledger `ai_usage.credits`, ciclo por suscripción, `include_usage` + `ctx.waitUntil(settle)`.
> - Código: `packages/shared/src/ai.ts` (`AI_CHAT_LIMITS`, `AI_CREDIT_CONSTANTS`, `creditsFromUsage`) y `packages/shared/src/features/catalog.ts` (`ai_chat.limits = ['ai_credits_monthly']`, `FREE_TIER_FEATURES`).
>
> No actualizar este archivo. Si contiene detalle útil no migrado, moverlo a los dos nuevos y proponer archivar este `.MD` en `docs/archive/`.

# Pricing y Límites — Asistente IA para Centro Deportivo

> **Nota de archivo:** contenido histórico previo a la migración a créditos (agosto 2026). Se conserva sin cambios debajo de este banner.

## Modelo de IA recomendado

- **Modelo:** `@cf/zai-org/glm-4.7-flash`
- **Input:** $0.06 / M tokens
- **Output:** $0.40 / M tokens
- **Contexto:** 131K tokens
- **Function calling:** ✅
- **Reasoning:** ✅
- **Plan:** Free tier (10,000 Neurons/día gratis)

---

## ¿Qué tan largo es 2,000 input + 500 output tokens?

| Métrica | 2,000 tokens (Input) | 500 tokens (Output) |
|---|---|---|
| Caracteres aprox | ~8,000 | ~2,000 |
| Palabras aprox | ~1,400 | ~350 |
| Equivalente | System prompt + historial + mensaje del usuario | Respuesta media del asistente (1-2 párrafos) |
| Mensaje del usuario solo | ~50-200 tokens (200-800 chars) | — |

---

## Costos reales con 150 miembros por org — GLM-4.7-Flash

| Escenario | Mensajes/día por usuario | Mensajes/día total | Input tokens/día | Output tokens/día | Neurons/día | Costo mensual (USD) |
|---|---|---|---|---|---|---|
| Bajo: 1 msg/día por usuario | 1 | 150 | 300,000 | 75,000 | 4,950 | $0.00 (cubierto por free tier) |
| Medio: 5 msgs/día por usuario | 5 | 750 | 1,500,000 | 375,000 | 24,750 | $4.05 |
| Alto: 10 msgs/día por usuario | 10 | 1,500 | 3,000,000 | 750,000 | 49,500 | $13.50 |
| Intensivo: 20 msgs/día por usuario | 20 | 3,000 | 6,000,000 | 1,500,000 | 99,000 | $48.60 |

> Cálculo por mensaje: 2,000 input tokens + 500 output tokens = ~33 Neurons

---

## Análisis de pricing — 1 org, 150 miembros, 5 entrenadores

| Concepto | Precio | Cantidad | Ingreso mensual | Costo mensual (AI) | Margen | Margen % |
|---|---|---|---|---|---|---|
| Organización | $35 | 1 | $35 | $13.50 (escenario alto) | $21.50 | 61% |
| Miembros | $3 | 150 | $450 | $13.50 | $436.50 | 97% |
| Entrenadores | $10 | 5 | $50 | $4.50 | $45.50 | 91% |
| **TOTAL** | — | — | **$535** | **$18.00** | **$517.00** | **97%** |

---

## Límites por mensaje (caracteres)

| Límite | Valor sugerido | Razón |
|---|---|---|
| Mensaje del usuario | 500 caracteres | Suficiente para describir una rutina completa o hacer una pregunta detallada |
| Respuesta del asistente | `max_tokens: 800` | ~3,200 caracteres, 1-2 párrafos detallados |
| System prompt | 2,000 caracteres | Define el rol del asistente, contexto del centro, tools disponibles |
| Historial de conversación | Últimos 10 mensajes (5 turnos) | Evita que el contexto crezca indefinidamente |

---

## Límites por usuario/día

| Límite | Miembro | Entrenador |
|---|---|---|
| Mensajes por día | 30 mensajes | Ilimitado |
| Conversaciones simultáneas | 1 | 5 |
| Sesiones por día | 5 | 20 |

---

## Límites por org/día

| Límite | Valor | Razón |
|---|---|---|
| Total de mensajes/día | 3,000 (150 usuarios × 20) | Protege contra pico de uso |
| Tokens consumidos/día | Monitorear, alertar a las 100K Neurons | Para detectar abuso |
| Entrenadores activos | Según plan | Escalable |

---

## Plan Miembro — $3/mes

- 30 mensajes/día con el asistente de IA
- Máximo 500 caracteres por mensaje
- Crear y modificar rutinas propias
- Consultar ejercicios y técnicas
- 1 conversación activa a la vez

## Plan Entrenador — $10/mes

- Mensajes ilimitados con la IA
- Crear rutinas para cualquier miembro de la org
- Asignar rutinas a miembros
- Modificar rutinas de miembros
- 5 conversaciones activas simultáneas
- Acceso a tools avanzadas (análisis de progreso, sugerencias de periodización)

## Plan Organización — $35/mes

- Hasta 150 miembros incluidos
- Hasta 10 entrenadores
- Dashboard de administración
- Branding personalizado del chat
- Límite global de 3,000 mensajes/día
- Reportes de uso

## Plan Enterprise (sugerido para >150 miembros)

- $50/mes base + $2/miembro + $8/entrenador
- Sin límite de miembros
- SLA y soporte prioritario

---

## Punto de equilibrio

- Costo fijo principal: Workers Paid — **$5/mes**
- Con una sola org:
  - Ingreso: $535/mes
  - Costo IA: ~$18/mes
  - Costo infraestructura: $5/mes
  - **Profit: $512/mes por org (96%)**
- Se necesitarían más de 30 orgs consumiendo al máximo para que el costo de IA se acerque al ingreso.

---

## Add-on de embeddings/RAG

Si el chat necesita conocimiento de la biblioteca de ejercicios del centro:
- Modelo: `@cf/qwen/qwen3-embedding-0.6b` — $0.012 / M tokens
- Vectorize para almacenamiento vectorial
- Costo adicional estimado: ~$0.50-$2/mes por org
