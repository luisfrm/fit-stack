# Sistema de tasks (FS-NNNN)

> Guía canónica del sistema de trabajo por tasks de Fit-Stack. El **índice** de tasks vive en `vaults/tasks/README.md`; esta guía explica el **flujo** y el **formato**.

## Qué es una task

Una **task** es el registro de un **requerimiento** con alcance y dueño claros, que se entrega en **un solo PR**. Cada task es una carpeta autocontenida: el requerimiento lo escribe el humano; el plan y las fases los genera el agente `planner`.

## Cuándo crear una task (y cuándo no)

| Situación                                   | Dónde va                                |
| ------------------------------------------- | --------------------------------------- |
| Requerimiento con alcance y dueño claros    | **Task** (`vaults/tasks/FS-NNNN-slug/`) |
| Hallazgo/deuda sin dueño, bug suelto, idea  | Backlog (`vaults/backlog/`)             |
| Feature pausada (Bridge, `apps/api` legacy) | No se planifica sin aviso explícito     |

Un ítem del backlog **se promueve a task** cuando tiene alcance y dueño. Los hallazgos sin dueño van al [[backlog/README|backlog]].

## Convención de nombres

```
FS-NNNN-slug-descriptivo/
```

- `FS` — prefijo del proyecto.
- `NNNN` — 4 dígitos con ceros, **auto-incremental** (`FS-0001`, `FS-0002`, …). No se reutiliza ni se renumera.
- `slug` — descripción corta en `kebab-case`.

El número lo asigna el script automáticamente (no se escribe a mano).

## Flujo

1. **Crear** — `pnpm task:new "<título>"` crea la carpeta con el siguiente `FS-NNNN` y un `task.md` desde `vaults/tasks/_template/task.md` (más `phases/`).
2. **Requerir** — el humano completa `task.md`: problema, criterios de aceptación, alcance y `depends_on`.
3. **Planificar** — `/plan` (agente `planner`) escribe `plan.md` + `phases/*.md` dentro de la task.
4. **Implementar** — se ejecuta fase por fase en la rama `feat/FS-NNNN-slug`.
5. **Cerrar** — se mergea el PR; `status: done` y `pr:` con la URL.

> Atajo: `/task "<título>"` encadena crear → requerir → planificar.

## Estructura de la task

```
vaults/tasks/FS-NNNN-slug/
├── task.md          ← REQUERIMIENTO (humano): problema, criterios, alcance
├── plan.md          ← PLAN DE EJECUCIÓN (LLM `planner`): fases, archivos, verificaciones
└── phases/          ← detalle de implementación por fase (LLM)
    ├── README.md    ← índice y orden de las fases
    ├── phase-0.md
    └── …
```

| Archivo       | Autor            | Contenido                                                           |
| ------------- | ---------------- | ------------------------------------------------------------------- |
| `task.md`     | Humano           | **Qué** y **por qué**. Problema, criterios, alcance, dependencias.  |
| `plan.md`     | Agente `planner` | **Cómo**. Orden por capas, archivos a tocar, verificación por fase. |
| `phases/*.md` | Agente `planner` | Detalle de implementación de cada fase.                             |

El requerimiento **no** se reescribe cuando cambia la implementación: se actualiza el `plan.md`/fases. Si cambia el _qué_, se crea una task nueva o se anota la enmienda en `task.md`.

## Formato de `task.md`

### Frontmatter (inglés)

```yaml
---
id: FS-NNNN
aliases: ["FS-NNNN"] # permite enlazar [[FS-NNNN]]
title: Título corto de la task
status: draft # draft | planning | in_progress | blocked | done | cancelled
priority: medium # low | medium | high | critical
created: YYYY-MM-DD
depends_on: [] # [FS-0001, …]
pr: null # URL del PR cuando exista
---
```

### Cuerpo (español, secciones fijas)

1. `## Problema` — qué y por qué (contexto de negocio y dolor actual).
2. `## Criterios de aceptación` — checklist **verificable**.
3. `## Alcance` — tabla por capa (`packages/shared`, `packages/database`, `apps/…`).
4. `## Fuera de alcance` — evita creep; enlaza la task que sí lo cubre.
5. `## Notas` — restricciones, decisiones y wiki-links (`[[ARCHITECTURE]]`, `[[PAYMENT_STATUSES]]`, …).
6. `## Plan de ejecución` — puntero a `plan.md`/`phases/`.

## Estados

`draft` → `planning` → `in_progress` → (`blocked`) → `done` / `cancelled`.

- `draft`: creada, sin completar.
- `planning`: el `planner` está generando `plan.md`/fases.
- `in_progress`: en implementación.
- `blocked`: esperando una dependencia (`depends_on`).
- `done` / `cancelled`: cerrada.

## Reglas

- **1 task = 1 PR.** Rama `feat/FS-NNNN-slug` (o `fix/`, `refactor/` según el tipo).
- Si un PR cubre varias tasks, documéntalo en cada `task.md` (campo `pr`).
- `depends_on` declara dependencias; no se mergea una task con dependencias sin resolver.
- Los `task.md` se enlazan por su ID (`[[FS-0001]]`) porque muchos archivos se llaman `task.md`.
- El índice de tasks (`vaults/tasks/README.md`) se actualiza al crear y al cerrar.

## Idioma

- **Frontmatter e identificadores**: inglés (`status`, `priority`, `depends_on`, `pr`).
- **Prosa de la bóveda** (`task.md`, `plan.md`, `phases/`): **español**.
- Rutas, código y comandos: siempre en su forma literal.

## Comandos

```bash
pnpm task:new "Nombre de la task"   # crea FS-NNNN-slug/ con task.md + phases/
/plan                                # genera plan.md + phases/ dentro de la task
/task "<título>"                     # crear + requerir + planificar (encadenado)
```
