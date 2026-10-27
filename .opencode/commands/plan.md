---
description: Diseña un plan de implementación claro delegando en PM y File Explorer, explicando el por qué y para qué en palabras simples y evitando sobre-ingeniería.
agent: plan
model: opencode-go/deepseek-v4.1-flash
---

Genera un plan de implementación técnico, pragmático y en lenguaje natural para la tarea o requerimiento indicado en `$ARGUMENTS`.

Tu objetivo es ahorrar tiempo al usuario delegando la recolección de contexto a los subagentes especializados (`pm` y `file-explorer`), filtrando la complejidad innecesaria y entregando un plan claro, fundamentado en el código real del proyecto y listo para ejecutar.

---

## Flujo de Ejecución Obligatorio

Sigue rigurosamente estos pasos en orden:

### Paso 1: Obtener Contexto de la Tarea (Delegar a `@pm`)
Delega en el subagente `pm` pasándole `$ARGUMENTS`:
- Si contiene un ID de Linear (ej. `RD-117`), pídele que consulte la issue principal, sus sub-issues asociadas, criterios de aceptación, dependencias y estado actual.
- Si es una descripción libre, pídele que analice el alcance, apps afectadas y criterios de aceptación.

### Paso 2: Obtener Contexto del Proyecto (Delegar a `@file-explorer`)
Con la respuesta de `pm` (rutas, apps afectadas, entidades o módulos), delega en el subagente `file-explorer`:
- Pídele que busque dónde vive este flujo hoy en el repositorio (`apps/api-worker`, `apps/panel`, `apps/console`, `packages/database`, `packages/shared`, etc.).
- Pídele que identifique qué código ya existe que podamos reutilizar (tablas, servicios, endpoints, componentes de `@workspace/ui`, helpers).
- Pídele que localice patrones similares existentes para imitarlos y no inventar ruedas nuevas.

### Paso 3: Filtrar Sobre-Ingeniería (Pragmatismo Radical)
Una vez recibido el contexto de ambos subagentes, analiza qué se necesita **de verdad**:
- **Cero sobre-ingeniería**: No construyas para el futuro lo que no se necesita hoy. Descarta funcionalidades especulativas o prematuras (ejemplo: si solo se requieren recibos o constantes básicas, no inventes motores fiscales, IVA/IGTF ni flujos tributarios complejos no solicitados).
- **Invariantes duras de Fit-Stack (`AGENTS.md`)**:
  - Sin transacciones interactivas (Neon HTTP: sentencias atómicas o compensación explícita en `catch`).
  - Dinero siempre en centavos enteros (`integer`).
  - Zona horaria siempre de la sesión (`activeOrganization.timezone`), sin fallbacks silenciosos.
  - Aislamiento multi-tenant estricto (`organizationId`).
  - Arquitectura en 3 capas (Route Handler con `route-handler.ts` -> Service -> Repository).
  - Usar el cliente `api` (ofetch wrapper), `fetch` nativo prohibido.
  - Reutilizar componentes de `@workspace/ui` sin clases ad-hoc.
  - Pagos y suscripciones nunca se eliminan.

---

## Formato de Salida del Plan

Entrega el resultado final redactado en **español**, con palabras simples y tono natural (como un colega senior explicando la solución en una sesión de pair programming):

### 📋 1. Contexto de la Tarea (Desde PM)
- Qué pide la issue/tarea y qué objetivo persigue.
- Sub-issues o dependencias identificadas y criterios de aceptación esenciales.

### 🔍 2. Contexto del Proyecto (Desde File Explorer)
- Dónde vive este flujo actualmente en el monorepo.
- Archivos existentes relevantes y patrones que tomaremos como referencia directa.

### 💡 3. Qué Aplica de Verdad (Decisiones y Anti-Overengineering)
- **Qué haremos y por qué**: La solución más directa y mantenible.
- **Qué descartamos explícitamente y por qué**: Qué complejidad, abstracciones o elementos prematuros dejamos fuera para mantener el sistema simple y enfocado.

### 🛠️ 4. Paso a Paso de Implementación
Organiza los pasos en secuencia lógica (por ejemplo: *1. Base de datos / Schema si aplica*, *2. Backend / API*, *3. Frontend / UI*).
Para cada paso:
- **Archivo**: Ruta exacta en el monorepo.
- **Qué se hace**: Acción clara y concreta.
- **Por qué y Para qué**: La razón funcional y técnica detrás de este cambio.
- **Detalle clave**: Helpers, funciones, middlewares (`requireOrgPermission`, etc.) o componentes de `@workspace/ui` a reutilizar. (Sin bloques gigantescos de código; solo firmas o snippets indispensables).

### 🧪 5. Verificación y Pruebas
- **Comandos técnicos**: Comandos exactos a ejecutar (`pnpm typecheck`, `pnpm lint`, tests aplicables).
- **Prueba funcional paso a paso**: Cómo validar manualmente el flujo de punta a punta (paso 1, paso 2, paso 3 en la UI o API).

### ⚠️ 6. Puntos de Atención e Invariantes
Recordatorios breves de riesgos para quien vaya a codificar (`coder-expert` o el desarrollador), recordando que los comentarios en el código deben estar en inglés.
