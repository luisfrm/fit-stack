# Tasks — índice

> Registro de requerimientos del proyecto. **Guía del sistema: [[task-system]]** (flujo, formato y reglas).
>
> Para crear una task nueva: `pnpm task:new "<título>"` — asigna el siguiente `FS-NNNN` y genera `task.md` + `phases/`.

## Índice de tasks

| ID          | Título                             | Estado  | PR  |
| ----------- | ---------------------------------- | ------- | --- |
| [[FS-0001]] | Payment receipts (Panel + Console) | ✅ done | —   |
| [[FS-0002]] | Subscription integrity - compensacion y periodo servidor | draft | — |
| [[FS-0003]] | Backlog cumplido huérfano (storage R2, AI compat, front-load) | ✅ done | — |

> El índice se actualiza al crear/cerrar una task.

## Estructura de una task

```
vaults/tasks/FS-NNNN-slug/
├── task.md          ← requerimiento (humano)
├── plan.md          ← plan de ejecución (agente `planner`)
└── phases/          ← detalle por fase (agente `planner`)
```
