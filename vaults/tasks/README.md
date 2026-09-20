# Tasks — sistema de trabajo de Fit-Stack

> Esta carpeta es el **registro de requerimientos** del proyecto. Cada task es una carpeta autocontenida, se planifica con fases generadas por el LLM y se ejecuta en **un solo PR**.

## Convención de nombres

```
FS-NNNN-slug-descriptivo/
```

- `FS` — prefijo del proyecto (Fit-Stack).
- `NNNN` — 4 dígitos con ceros, **auto-incremental** (`FS-0001`, `FS-0002`, …). Igual que la serie de comprobantes: no se reutiliza ni se renumera.
- `slug` — descripción corta en `kebab-case`.

Para crear una task nueva usa el script (asigna el siguiente número automáticamente):

```bash
pnpm task:new "Nombre de la task"
```

## Estructura de una task

```
vaults/tasks/FS-NNNN-slug/
├── task.md          ← REQUERIMIENTO (humano): problema, criterios, alcance
├── plan.md          ← PLAN DE EJECUCIÓN (LLM `planner`): fases, archivos, verificaciones
└── phases/          ← detalle de implementación por fase (LLM)
    ├── README.md    ← índice y orden de las fases
    ├── phase-0.md
    └── …
```

### Responsabilidades

| Archivo       | Autor            | Contenido                                                                        |
| ------------- | ---------------- | -------------------------------------------------------------------------------- |
| `task.md`     | Humano           | **Qué** y **por qué**. Problema, criterios de aceptación, alcance, dependencias. |
| `plan.md`     | Agente `planner` | **Cómo**. Orden por capas, archivos a tocar, comando de verificación por fase.   |
| `phases/*.md` | Agente `planner` | Detalle de implementación de cada fase.                                          |

El requerimiento (`task.md`) **no** se reescribe cuando cambia la implementación: se actualiza el `plan.md`/fases. Si cambia el _qué_, se crea una task nueva o se anota la enmienda en `task.md`.

## Frontmatter de `task.md`

```yaml
---
id: FS-NNNN
title: Título corto
status: draft # draft | planning | in_progress | blocked | done | cancelled
priority: medium # low | medium | high | critical
created: YYYY-MM-DD
depends_on: [] # [FS-0001, …]
pr: null # URL del PR cuando exista
---
```

## Flujo

1. **Crear** — `pnpm task:new "<título>"` genera la carpeta con el `task.md` desde `_template/task.md`.
2. **Requerir** — el humano completa `task.md` (problema, criterios, alcance).
3. **Planificar** — el comando `/plan` (agente `planner`) escribe `plan.md` + `phases/`.
4. **Implementar** — se ejecuta fase por fase en la rama `feat/FS-NNNN-slug`.
5. **Cerrar** — 1 task = 1 PR. Al mergear, `status: done` y `pr:` apuntando al PR.

### Reglas

- **1 task = 1 PR.** Si un PR cubre varias tasks, documéntalo en cada `task.md` (campo `pr`).
- Las dependencias entre tasks se declaran en `depends_on`; no se mergea una task con dependencias sin resolver.
- Ramas: `feat/FS-NNNN-slug` (o `fix/`, `refactor/` según el tipo).
- Los hallazgos sin dueño (bugs sueltos, deuda) van al [[backlog/README|backlog]], no abren una task por sí solos.
- Cada `task.md` declara `aliases: ["FS-NNNN"]`, así que se enlaza por su ID: `[[FS-0001]]` (evita la colisión de muchos `task.md`).

## Índice de tasks

| ID          | Título                             | Estado  | PR  |
| ----------- | ---------------------------------- | ------- | --- |
| [[FS-0001]] | Payment receipts (Panel + Console) | ✅ done | —   |

> El índice se actualiza al crear/cerrar una task.
