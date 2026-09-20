---
aliases: ["PENDING", "Backlog"]
---

# Backlog — temas pendientes

> Este documento reemplaza al antiguo `PENDING.md`. El backlog está **desglosado por tema** para poder priorizar y abordar cada área por separado. Los ítems sin dueño viven aquí; cuando uno tiene alcance y dueño claros, **se promueve a task** en [[task-system|el sistema de tasks]].

## Temas

| Tema                    | Foco                                                           | Archivo                   |
| ----------------------- | -------------------------------------------------------------- | ------------------------- |
| Fiscal                  | Facturación formal (PAC/PAD), IGTF, disclaimer del emisor      | [[fiscal]]                |
| Comprobantes            | Correlativo, barrido, auditoría `gaps[]`, DLQ de email         | [[comprobantes]]          |
| Pagos y suscripciones   | Atomicidad, DELETE SaaS, devoluciones, doble periodo histórico | [[pagos-suscripciones]]   |
| Storage (R2)            | Re-subida de assets tras el corte de taxonomía                 | [[storage]]               |
| IA / Chat               | Packs de créditos (Stripe), RAG fase 2 y avanzado              | [[ai-chat]]               |
| Access control / Bridge | Refactor del Bridge, esquema de hardware multi-dispositivo     | [[access-control-bridge]] |

## Cómo leer cada ítem

- Cada ítem trae su **disparador** ("cuándo se aborda") para no perderlo.
- La prioridad es orientativa; no bloquea nada por sí sola.
- Los ítems ya implementados se retiran del backlog (quedan en el historial de git y en los docs vigentes).

> [!NOTE]
> El objetivo de este backlog es que Fit-Stack sea un software de gestión seguro sin "pisar la raya" fiscal, dejando el camino libre para la facturación electrónica formal en el futuro.
