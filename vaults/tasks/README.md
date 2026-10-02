# Tasks — índice (⏸ DEPRECATED)

> **Este índice es historial de lectura.** El trabajo planificado se sigue ahora en **Linear** (team `Rivas Digital`): **1 issue = 1 PR**, y el agente `planner` escribe el plan completo en la descripción del issue. No se crean tasks nuevas aquí, no se ejecuta `pnpm task:new` y no se editan las existentes. Ver **Task Tracking (Linear)** en `AGENTS.md` y la nota de deprecación en [[task-system]].
>
> Las tareas que quedaron abiertas (FS-0005, FS-0006) deben replantearse como issues en Linear antes de continuar.

## Índice de tasks

| ID          | Título                             | Estado  | PR  |
| ----------- | ---------------------------------- | ------- | --- |
| [[FS-0001]] | Payment receipts (Panel + Console) | ✅ done | —   |
| [[FS-0002]] | Subscription integrity - compensacion y periodo servidor | ✅ done | — |
| [[FS-0003]] | Backlog cumplido huérfano (storage R2, AI compat, front-load) | ✅ done | — |
| [[FS-0004]] | Fix receipt PDF render en jobs-worker (react-pdf a pdf-lib) | ✅ done | #22 |
| [[FS-0005]] | Fix jobs-worker queue pipeline y error pre-PDF comprobantes | in_progress | — |
| [[FS-0006]] | Refactor: unificar el motor de comprobantes Panel↔Console con adapter | planning | — |

> El índice se actualiza al crear/cerrar una task.

## Estructura de una task

```
vaults/tasks/FS-NNNN-slug/
├── task.md          ← requerimiento (humano)
├── plan.md          ← plan de ejecución (agente `planner`)
└── phases/          ← detalle por fase (agente `planner`)
```
