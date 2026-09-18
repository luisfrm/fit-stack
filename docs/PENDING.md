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

## 7. Comprobantes — cadencia del barrido en pre-venta

- [ ] **Barrido de comprobantes (`jobs-worker.scheduled()`): cron cada 10 h → 10 min al vender con clientes reales.**
  - Hoy (pre-venta) el cron en `infrastructure/terraform/workers.tf` (`cloudflare_workers_cron_trigger.jobs_sweep`) es `0 */10 * * *` para no generar ~144 invocaciones/día por ambiente sin uso real.
  - El barrido repara el hueco "número asignado pero evento nunca encolado" (publicación fallida a `fit-receipt-events` o consumer caído); con 10 h el peor caso de recuperación es ≤ ~10 h (cron) + 15 min (umbral de `receipt_issued_at`).
  - Al pasar a clientes reales, volver a `*/10 * * * *` (recuperación ≤ 25 min). Cambio en Terraform + actualizar este ítem y los docs que citan la cadencia.
  - El flujo normal NO depende del barrido: el render se dispara al instante por el `send` del paso 1.

## 9. Comprobantes — gating fiscal (C2): tasa del IGTF y emisor plataforma

- [ ] **Confirmar tasa y base del IGTF con un contador antes de encenderlo en un gym real.**
  - El IGTF nace **apagado** y **nunca automático**: activarlo exige declarar el negocio como contribuyente formal + marcar la confirmación de tasa + indicar la tasa a mano (`fiscalConfig.confirmedTaxes`). El `3%` de `COUNTRIES.VE.conditionalTaxes` es **referencia documentada**, no valor efectivo: la tasa varía por decreto (`docs/FACTURATION.md` §6).
  - Base implementada: `basis: 'gross_first'` — el IGTF se **extrae primero** del monto cobrado y el resto se descompone tax-inclusive con el IVA (cambia la base del IVA; el UI lo advierte). Verificar con el contador que la base legal es el monto pagado en divisa.
  - Ejemplo verificado en tests: cobrado 30,90 con IVA 16 % + IGTF 3 % → IGTF 0,93 · base 25,84 + IVA 4,13 · suma exacta 30,90.
- [ ] **Declarar a FitStack (emisor plataforma) como contribuyente formal si se quiere desglose en los comprobantes `FS-N`.**
  - Hoy no existe storage ni UI de `fiscalConfig` para el emisor plataforma, así que los comprobantes SaaS persisten `subtotal = amountPaid / taxTotal = 0 / taxDetails = []` (solo el total cobrado) y lo dicen en Console → Settings → Emisor. Es la postura conservadora correcta (nadie declaró ese IVA).
  - Para habilitarlo: `platform_setting` con el `fiscalConfig` de FitStack + toggles en `emitter-settings.tsx` (mismo patrón del Panel: declaración, tasa manual, confirmación) y cablearlo en el paso 1 SaaS y en el twin de `receipt-compose` (`platform-receipts.service.ts` + `jobs-worker`).

## 11. Comprobantes — comprobantes previos al snapshot del emisor (C1)

- [ ] **Los pagos emitidos ANTES de C1 (`emitter_snapshot = NULL`) siguen recomponiéndose en vivo: su JSON puede divergir del PDF si el emisor edita su perfil.**
  - Estado terminal **documentado** (no es un bug): la migración `0016` no hace backfill porque el snapshot no se puede reconstruir con fidelidad — la identidad del momento de emisión se perdió al no persistirse.
  - El PDF en R2 sí es inmutable y conserva lo emitido; lo que puede cambiar es el JSON de `GET /:id/receipt` y la fila del libro (sin `emisor`/`emitido_por`).
  - Si una auditoría exige reproducibilidad del histórico completo, la opción honesta es un **acta de conciliación** (fecha de corte + “estos comprobantes se reimprimen con la configuración vigente”) o incrustar el snapshot del PDF vía OCR: no un backfill inventado.
- [x] **RESUELTO (C9)** — E2E preexistente: `e2e/panel/subscriptions.spec.ts` (pago pendiente) fallaba de forma determinista por el prewarm de `/payments` + `revalidate: 60` (fixture creado por API después del prewarm). Se aplicó la opción “la lista accionable no se cachea” (`cache: 'no-store'`). Ver `tasks/correcciones-comprobantes.md` → C9.

## 10. Comprobantes Console — universo completo de la serie en la auditoría (C4)

- [ ] **Cuando la serie global `FS-N` crezca (miles de comprobantes), acotar la lectura del universo de `gaps[]`.**
  - La auditoría necesita el universo **completo** de números (cualquier ausente es un hueco), así que hoy `getPlatformReceiptSequenceState` lee todas las filas numeradas de `platform_subscription_payment` (solo 5 columnas, sin paginar). Es correcto y trivial hoy; no lo será con decenas de miles de filas.
  - Disparador: si el reporte de Console tarda visiblemente, acotar por rango (`seq >= lastNumber - N`) o particionar la serie por año de emisión, manteniendo la semántica de hueco.
  - Lo mismo aplica al Panel si una organización acumula muchos años en una sola serie.

## 8. Comprobantes Console — disclaimer con país proxy

- [ ] **Disclaimer Console usa el país del org receptor como proxy hasta configurar `fitstack_country_code`.**
  - El disclaimer legal de los comprobantes de Console debería corresponder al país del **emisor** (FitStack), pero FitStack aún no tiene país propio configurado: se usa el `countryCode` del org receptor como aproximación temporal (ver `plan.md`, decisión congelada).
  - Al definir `fitstack_country_code`, cambiar el disclaimer a ese país y tachar este ítem. No dejar que el proxy sobreviva silenciosamente hasta producción.

## 12. Registro financiero — atomicidad y cascada del borrado de miembro (C9)

- [ ] **`create()` de suscripción + pago NO es atómico pese a la regla “Atomic Invoicing”.**
  - `subscriptions.service.create()` inserta la **suscripción** y después el **pago** en dos sentencias independientes. Si la segunda falla (por ejemplo, un dato inválido del pago), queda una **suscripción huérfana sin pago**, y desde C9 ya no existe `DELETE /api/subscriptions/:id` que la limpie.
  - Opciones: envolver ambos inserts en una transacción (si el driver `neon-http` la soporta vía `db.transaction`) o compensar en el mismo `catch` eliminando la fila recién insertada.
  - Consulta de detección: `SELECT s.* FROM subscription s LEFT JOIN payment p ON p.subscription_id = s.id WHERE p.id IS NULL`.
- [ ] **El borrado de un miembro arrastra su histórico financiero por cascada.**
  - `payment.member_id` y `subscription.member_id` son `ON DELETE CASCADE`: borrar un miembro elimina sus pagos y suscripciones. Es hoy la única vía por la que un registro financiero desaparece (la suscripción ya no tiene DELETE) y es también de lo que depende la limpieza de E2E.
  - Coherente con “un registro financiero no se elimina”: el miembro con pagos debería darse de **baja lógica** (desactivar) en vez de borrarse, o el borrado debería rechazarse (409) cuando tiene pagos. Requiere decidir la política del módulo Members y actualizar E2E (la limpieza pasaría al borrado de la organización).

## 13. Console — el borrado de la suscripción SaaS puede vaciar la serie `FS-N`

- [ ] **`DELETE /api/platform/subscriptions/:id` existe y borra la suscripción junto con sus pagos por cascada.**
  - Es la asimetría consciente respecto del Panel (donde C9 eliminó el DELETE de suscripciones): en Console la suscripción es de FitStack y el borrado se usa para deshacer altas equivocadas.
  - El problema: si esa suscripción ya tenía comprobantes `FS-N` emitidos, sus filas desaparecen del libro con sus números. La auditoría de `gaps[]` (que necesita el universo de números emitidos) las reportaría como **huecos** o, peor, el `last_number` de la secuencia quedaría por delante de las filas existentes.
  - Opciones: (a) rechazar el borrado cuando la suscripción tiene comprobantes numerados (409 + cancelar en su lugar), (b) borrado lógico (`cancelled_at` + un flag de “archivada”), (c) conservar las filas de pago huérfanas (FK sin cascada) para no perder el correlativo.
  - Mientras no se decida, el Panel y Console tienen reglas distintas para el mismo concepto y eso debe ser una elección explícita, no una sorpresa en una auditoría.

## 14. Comprobantes — email perdido en la DLQ después de la marca de notificado (C6)

- [ ] **El barrido de C6 no cubre el email que ya se encoló y agotó reintentos.**
  - El paso 2 marca `receipt_notified_at` **antes** de encolar `email.payment_receipt` / `email.org_payment_received`, y solo la revierte si el `send()` a la cola falla. Si el mensaje ya encolado falla N veces en el handler de email y cae a la DLQ de `fit-task-events`, la marca queda puesta y el 2.º predicado del barrido (`receipt_notified_at IS NULL`) no lo ve.
  - Recuperación hoy: **manual** — `POST /api/payments/:id/send-email` (Panel) o `POST /api/platform/subscriptions/payments/:id/resend` (Console).
  - Opciones si se quiere automático: (a) que el handler de email limpie la marca al fallar de forma definitiva (requiere que conozca el `paymentId`/scope, hoy no lo hace), o (b) un barrido de la DLQ, que Cloudflare no expone como cola consultable (habría que persistir el fallo en DB).
  - Disparador: si aparece un comprobante con `receipt_pdf_key` y sin email entregado en una auditoría real.

## 15. Comprobantes — naming cosmético `platform_document_sequence.next_number` (C7)

- [ ] **Renombrar `next_number` a `last_number` para alinear con `organization_document_sequence.last_number`.**
  - `platform_document_sequence.next_number` guarda el **ÚLTIMO** número entregado, no el siguiente (ver `packages/database/src/repositories/platform-receipts.repository.ts`). El nombre induce a error, pero el comportamiento es el correcto.
  - Puramente cosmético y **sí** requiere migración → no vale un ciclo propio: agrupar con la próxima migración que se genere por otro motivo.
  - El contrato del repositorio ya expone `getPlatformReceiptSequenceState(...).lastNumber`, así que todos los consumidores hablan en términos de "último"; solo el nombre de la columna queda desalineado.

## 16. Comprobantes — claim-then-number, cierre total de la carrera de correlativo (D4 / C0)

- [ ] **Riesgo residual de la carrera de doble emisión: si el perdedor no es el último consumidor, su número queda irreclaimable sin renumerar (prohibido).**
  - Contexto: C0 dejó documentado este riesgo. La compensación (`releaseLastPlatformNumber`) solo revierte cuando el perdedor sigue siendo el último consumidor; si otro pago consumió la secuencia después, el número perdido queda como hueco auditado. La guarda tardía reduce la ventana a milisegundos, pero no la cierra.
  - Disparador explícito para implementar la solución completa: **si el reporte de huecos (`gaps[]`) muestra un hueco no explicado en producción.**
  - Esbozo de la solución completa (claim-then-number): reclamar el pago con `UPDATE … WHERE receipt_number IS NULL RETURNING id` (persistiendo ya los impuestos) **antes** de consumir la secuencia y asignar el número después. Obligaría a una rama extra de reparación en el barrido para el estado intermedio "reclamado sin número".
  - Estado: NO implementado; decisión D4 congelada (ver `tasks/correcciones-comprobantes.md`).

## 17. Pagos — devoluciones (`refunded`): reservado, no implementado

- [ ] **Implementar la devolución de un cobro.**
  - `PAYMENT_STATUSES.REFUNDED` existe en el enum y `QUALIFYING_PAYMENT_STATUSES` lo trata como pago que sostiene el periodo (`validated | refunded`), pero **ningún flujo lo produce**: no hay UI ni servicio que marque un pago como `refunded` (`updatePaymentStatus` ya escribe `refunded_at` si se le pide, pero nadie lo llama con ese estado desde producto).
  - Decidir la semántica completa antes de exponerlo: ¿revierte el periodo acumulado?, ¿emite nota de crédito o anula el comprobante?, ¿afecta el status SaaS?, ¿aplica también al Panel (`payment`) además de Console (`platform_subscription_payment`)?
  - Hoy `refunded` **no** toca el flag ANULADO y no cancela la suscripción.
  - Disparador: cuando se pida una devolución real o se conecte una pasarela de pago.

## 18. Suscripciones — auditoría del doble periodo histórico

- [ ] **Revisar las suscripciones cuyo `current_period_end` excede `start_date + Σ duración de los pagos validated`.**
  - El bug de front-load (punto 7) pudo haber dejado `current_period_end` inflado en altas con pago `processing` que se validaron más tarde. La corrección evita nuevos casos; **no auto-corregir** los históricos.
  - Detección (indicativa; normalizar la duración `day|week|month|year` por pago antes de sumar):
    ```sql
    -- periodos por delante del ciclo realmente pagado
    SELECT s.id, s.organization_id, s.start_date, s.current_period_end
    FROM platform_subscription s
    WHERE s.current_period_end > (
      s.start_date + <Σ duración normalizada de los pagos validated de s>
    );
    ```
  - Revisar manualmente cada exceso (puede ser un caso legítimo) antes de tocar datos; si procede, corregir con una migración de datos aprobada, nunca por inferencia automática.
  - Disparador: auditoría de facturación SaaS o reclamo de un gym.

---

> [!NOTE]
> Estos cambios permiten que el sistema sea un software de gestión segura sin "pisar la raya" fiscal, pero dejando el camino 100% libre para la facturación electrónica formal en el futuro.
