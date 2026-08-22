# Próximas Tareas de Facturación e Internacionalización

Lista de pendientes para preparar el sistema para facturación fiscal formal multi-país, alineada con los requerimientos regulatorios locales de cada país.

## 1. Preparación de Base de Datos (Estructura de Localización)
- [ ] **Tabla `organization`**: Añadir campos legales:
  - `country_code` (ISO 3166-1 alpha-2, ej: 'VE').
  - `tax_id` (Campo genérico para RIF/NIT/RFC).
  - `legal_name` (Nombre jurídico de la empresa).
  - `fiscal_address` (Dirección fiscal completa).
  - `fiscal_config` (JSONB para resoluciones de la DIAN o números de control SENIAT).
- [ ] **Tabla `payment`**: Refactorizar para desglose fiscal:
  - `subtotal` (Monto neto).
  - `tax_total` (Suma de impuestos).
  - `tax_details` (JSONB con desglose: IVA 16%, IGTF 3%, etc.).
  - `exchange_rate` (Tasa de cambio aplicada al momento del pago).
- [ ] **Tabla `gym_member`**: Añadir `fiscal_address` opcional.

## 2. Ajustes de UI y Experiencia de Usuario
- [ ] **Adaptación de Labels**: Cambiar etiquetas como "Cédula/RIF" dinámicamente según el `country_code` de la organización (ej: NIT para Colombia).
- [ ] **Disclaimer Legal**: Añadir nota en pie de página de recibos/correos: *"Este documento no es factura fiscal. Exija su factura legal en el establecimiento"*.

## 3. Integraciones de Facturación (Fase 2)
- [ ] **Filtro de Adaptadores**: Crear interfaz genérica de adaptadores para integrarse con PAC/PAD, Proveedores Tecnológicos u otros sistemas fiscales locales según el `country_code` de la organización.
- [ ] **Gestión de Impuestos Dinámicos**: Implementar lógica que calcule impuestos locales dinámicamente (ej. IGTF 3%, IVA 16%, etc.) según el `country_code` de la organización y el tipo de pago.

---
## 4. Control de Acceso Biométrico (Fase 2)
- [ ] **Optimización del Bridge (Python)**:
  - Refactorizar el código para mejorar la estabilidad de los hilos de fondo.
  - Implementar reconexión automática tras fallos de internet o API.
  - Añadir sistema de logs locales (SQLite) para asegurar que no se pierdan datos si el PC se apaga o pierde conexión.
  - Mejorar la gestión de errores específicos de la librería `requests` y `flet`.
- [ ] **Esquema de Base de Datos (Hardware)**:
  - Evaluar la creación de una tabla `access_control_device` para gestionar múltiples torniquetes/cámaras por organización.
  - Añadir campo `device_status` (heartbeat) para monitorear si el Bridge está online desde el CMS.
  - Considerar una tabla `access_rule` para lógica de horarios permitidos por fuera de la suscripción.

---
## 5. Integridad de Base de Datos y CI/CD
- [ ] **Flujo de Migraciones Estricto**: Implementar regla de "Generate -> Review -> Migrate" para evitar discrepancias en entornos compartidos. Prohibir `db:push` en producción.
- [ ] **Script de Verificación (`db:check`)**: Implementar comando para validar estáticamente que el esquema coincide con el folder de migraciones.
- [ ] **GitHub Actions (Integridad)**: Configurar workflow para ejecutar `db:check` automáticamente en cada Pull Request.
- [ ] **GitHub Actions (Despliegue)**: Automatizar la ejecución de `db:migrate` al hacer merge a `master` para actualizar bases de datos de producción/dev sin intervención manual mediante GitHub Secrets.

---

## 6. Chat IA — Créditos (migración 2026-08, pendiente post-migración)

> Estado real: migrado a **créditos** (`1 crédito = 1K tokens ×1.0`, `ai_credits_monthly`, `ai_usage.credits`). Fuentes vigentes: `docs/CHAT_PRICING.md` y `docs/CHAT_INFRASTRUCTURE.md`. Lo de abajo es lo que **falta**.

- [ ] **Packs de créditos (Stripe)** — comprar créditos extra sin cambiar de plan:
  - Constantes `CREDIT_PACKS` en `packages/shared/src/ai.ts` (1.000cr/$1.20, 3.000cr/$3.00, 7.000cr/$6.50) — hoy solo documentadas, sin código.
  - Tabla `ai_credit_pack_purchase` (org, créditos comprados/restantes, Stripe `payment_intent`, FIFO). Consumo **plan → packs** (el ledger `ai_usage` sigue por ciclo; los packs son tabla aparte).
  - Endpoints `POST /api/ai/packs/purchase` + webhook Stripe + UI en `panel` (billing) y `console` (gestor de packs).
  - Headers/balance deben sumar `remaining = plan_remaining + packs_remaining`.
- [x] **RAG Fase 1 (Base de Conocimiento)** — implementado:
  - Modelo `@cf/baai/bge-m3` 1024 dims (multilingüe) + **pgvector** HNSW, tablas `ai_knowledge_document`/`ai_knowledge_chunk` (`organization_id NULL` = plataforma).
  - Endpoints `/api/platform/knowledge` (console) + retrieval en `/api/ai/chat` (topK 4, minSimilarity 0.35, `PANEL_SYSTEM_PROMPT` + `[Contexto]`).
- [ ] **RAG Fase 2 (datos vivos + org-KB panel)** — function calling con datos reales (`members`, `payments`, `classes` por `organizationId`) + KB por organización editable desde panel. Ver `FUTURE_IDEAS.md` § 5.
- [ ] **RAG avanzado (futuro)** — re-ranking, cache de retrieval, embeddings por idioma ES/PT. Ver `FUTURE_IDEAS.md` § 5.
- [ ] **Compat / limpieza** — decidir cuándo retirar:
  - Columna legacy `ai_usage.count` (mensajes) — mantener hasta confirmar que ningún dashboard la lee.
  - Helpers `consumeAiMessage` / alias `daily`/`weekly` en `GET /api/ai/usage` — solo para tests viejos.
  - Cache `increment` de Redis (existe pero no se usa; la DB es fuente de verdad).

---

> [!NOTE]
> Estos cambios permiten que el sistema sea un software de gestión segura sin "pisar la raya" fiscal, pero dejando el camino 100% libre para la facturación electrónica formal en el futuro.
