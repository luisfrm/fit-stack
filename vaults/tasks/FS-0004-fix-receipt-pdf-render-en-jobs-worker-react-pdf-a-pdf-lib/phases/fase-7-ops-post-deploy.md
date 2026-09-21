# Fase 7 — Ops post-deploy: barrido, DLQ y ráfaga aceptada

> Requiere: deploy de la Fase 5. Se ejecuta en producción tras el merge.

## Objetivo

Drenar el backlog de pagos numerados sin PDF y dejar la cola sana, asumiendo la ráfaga de emails (decisión aprobada 3).

## Archivos

- Sin cambios de código. Operativa sobre `sweepPendingReceiptPdfs` y observabilidad de colas.

## Pasos

1. Tras el deploy, forzar el barrido (`sweepPendingReceiptPdfs`) para re-encolar el backlog numerado sin PDF (no esperar al cron de pre-venta).
2. Monitorear `fit-receipt-events-dlq`: debe tender a vacía a medida que el backlog se renderiza.
3. Esperar la **ráfaga de emails atrasados** del backlog (comportamiento aceptado por el usuario, no un incidente).
4. Validar muestra: comprobantes del backlog descargables (200 `ready`) con contenido correcto, y emails emitidos.

## Criterio de done

Backlog numerado-sin-PDF drenado, DLQ sin mensajes nuevos del incidente y muestra validada (descarga + email).

## Verificación

- Conteo pre/post de pagos numerados sin PDF (mismo estilo de queries que el checklist de `vaults/backlog/comprobantes.md` §1).
- Métricas de la DLQ en el PR o en la nota de cierre.
