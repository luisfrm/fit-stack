# Backlog — Access control / Bridge

> Refactor del Bridge y evolución del esquema de hardware.
> Volver al [[backlog/README|índice del backlog]]. Contexto: `AGENTS.md` §4 (Bridge **⏸ PAUSADO**).

## 1. Optimización del Bridge (Python)

- [ ] **Refactorizar el código para mejorar la estabilidad de los hilos de fondo.**
- [ ] **Reconexión automática** tras fallos de internet o API.
- [ ] **Sistema de logs locales (SQLite)** para asegurar que no se pierdan datos si el PC se apaga o pierde conexión.
- [ ] **Mejorar la gestión de errores** específicos de las librerías `requests` y `flet`.

## 2. Esquema de base de datos (hardware)

- [ ] **Evaluar** la creación de una tabla `access_control_device` para gestionar múltiples torniquetes/cámaras por organización.
- [ ] **Añadir** campo `device_status` (heartbeat) para monitorear si el Bridge está online desde el CMS.
- [ ] **Considerar** una tabla `access_rule` para lógica de horarios permitidos por fuera de la suscripción.

> **Nota**: al reactivar el Bridge, los 3 endpoints (`/verify`, `/sync-tasks`, `/mark-synced`) y `access-control.repository.ts` deben migrarse de `apps/api` (legacy) a `apps/api-worker` con `requireApiKey` + `ACCESS_CONTROL_API_KEY` (ver `AGENTS.md` §4).
> **Disparador**: cuando se retome el módulo de acceso físico.
