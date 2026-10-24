# Checklist del día de producción

> Se corre cuando entra el primer gimnasio real. Todo lo demás del motor está descrito en [`receipt-engine.md`](./receipt-engine.md); esto es solo la puesta en marcha.

## 1. Cadencia del barrido

- [ ] Cambiar el cron del barrido de `0 */10 * * *` (cada 10 h) a `*/10 * * * *` (cada 10 min) en `infrastructure/terraform/workers.tf` (`cloudflare_workers_cron_trigger.jobs_sweep`).
- [ ] `terraform apply` en el environment `production` (el workflow `terraform.yml` es manual).
- [ ] Confirmar en Cloudflare que el trigger del `jobs-worker` quedó con la nueva expresión.

La cadencia de 10 h es un ahorro de pre-venta, no un SLA: sin ella un PDF perdido tarda medio día en recuperarse.

## 2. Migraciones aplicadas

- [ ] Confirmar en el workflow `database-migrations.yml` que las migraciones del motor quedaron aplicadas en producción.
- [ ] Verificar que ninguna fila conserva los estados de pago retirados:

  ```sql
  SELECT status, count(*) FROM "platform_subscription_payment" GROUP BY status;
  ```

- [ ] Revisar que los comprobantes históricos sin snapshot siguen componiéndose (es el comportamiento previsto) y que ningún pago validado quedó sin número.
- [ ] `0030` — trials retirados. Ninguna suscripción debe conservar `is_trial` (la columna ya no existe) y ningún pago debe quedar con método `trial`:

  ```sql
  SELECT payment_method, count(*) FROM "platform_subscription_payment" GROUP BY payment_method;
  SELECT count(*) FROM "platform_subscription" WHERE cancellation_reason = 'trials_removed';
  ```

  Los históricos deben estar cerrados (`current_period_end <= now()`, `cancelled_at` no nulo) y sus pagos convertidos a `free`. La clave `allow_price_override` ya no debe existir en `platform_setting`.
- [ ] `0031` — normalización SaaS: las columnas `platform_rate_applied`/`platform_amount` existen y el backfill solo tocó filas reproducibles. Las que quedan en `NULL` son históricas sin tasa reproducible (se reportan como `unconvertedCount`), no un fallo:

  ```sql
  SELECT count(*) FILTER (WHERE "platform_amount" IS NULL) AS unconverted,
         count(*) AS total
    FROM "platform_subscription_payment" WHERE status = 'validated';
  ```

- [ ] Confirmar que `platform_setting.primary_currency` sigue siendo la moneda con la que se reporta (el endpoint de settings responde **409 `PRIMARY_CURRENCY_IMMUTABLE`** si se intenta cambiar con pagos SaaS existentes; un plan con pagos responde **409 `PLAN_CURRENCY_IMMUTABLE`**).

## 3. Auditoría de la serie

- [ ] Panel: correr la auditoría de correlativo (`GET /api/reports/receipts`) por organización y año.
- [ ] Console: correr la auditoría global de `FS-N` (`GET /api/platform/subscriptions/receipts`).
- [ ] Revisar `gaps[]`: debe estar vacío o contener solo huecos explicados por anulaciones (`anulado`), nunca un `hueco` sin explicación. Un hueco sin explicar es un bloqueante.

## 4. Colas y DLQ

- [ ] Revisar la DLQ de `fit-task-events` y de `fit-receipt-events`: ningún comprobante puede quedar con PDF pero sin correo entregado.
- [ ] Revisar los mensajes que agotaron reintentos: un fallo definitivo de entrega limpia la marca de notificado, así que el barrido re-encola el aviso; si el problema es otro, la recuperación es manual (`resend` / `POST /:id/issue`).
- [ ] Confirmar los cinco estados del barrido sin pendientes: reclamo vencido, numerado sin PDF, PDF sin aviso, anulado sin sello y anulado sin flag.

## 5. Terraform

- [ ] `terraform apply` (environment `production`) para las colas `fit-task-events` / `fit-receipt-events` con sus DLQ, los consumers y el cron. Los nombres se derivan del ambiente; no hay variables que ajustar.
- [ ] `pnpm check:infra-parity` en verde: los `wrangler.jsonc` y el Terraform declaran lo mismo.
- [ ] Nunca crear colas o triggers a mano con `wrangler`: si una cola se creó fuera de Terraform, hay que importarla antes del `apply` (ver [`../architecture/terraform.md`](../architecture/terraform.md)).

## 6. IGTF e impuestos

- [ ] Confirmar con el contador la tasa y la base del IGTF antes de encender el régimen formal en un gimnasio real (hoy `COUNTRIES` fija 3 % con base extraída del total bruto).
- [ ] Confirmar el país fiscal del emisor de la plataforma (`fitstack_country_code`) y su identificación fiscal: definen la etiqueta y el disclaimer de los `FS-N`.
- [ ] Recordar que encender `isFormalTaxpayer` no cambia la etiqueta del documento: la homologación sigue desactivada y todo sigue siendo "Comprobante de pago".

## 7. Cierre

- [ ] Un pago validado de prueba en Panel produce número, PDF, correo y descarga.
- [ ] Una anulación de prueba produce el PDF sellado y bloquea el original.
- [ ] `pnpm typecheck` y `pnpm lint` en verde antes del despliegue.
