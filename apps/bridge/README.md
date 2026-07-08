# Fit-Stack Bridge

App de escritorio para control de acceso biométrico/QR. Corre localmente en el kiosk del gimnasio. Construida con **Python 3.12+** y **Flet** (UI). Gestionada con `uv` — no forma parte del monorepo Turbo.

---

## Función

1. Sincroniza miembros con dispositivos biométricos (rostro/huella/QR/tarjeta)
2. Valida accesos contra suscripciones activas via API
3. Loguea cada intento de acceso (granted/denied/error)

---

## Quick Start

### Prerequisites

- Python 3.12+
- `uv` (gestor de paquetes)
- `apps/api` corriendo con `ACCESS_CONTROL_API_KEY` configurado

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `CLOUD_API_URL` | ✅ | API base URL (default: `http://localhost:3000/api/access-control`) |
| `CLOUD_API_KEY` | ✅ | Debe coincidir con `ACCESS_CONTROL_API_KEY` del API |
| `ORGANIZATION_ID` | ✅ | ID de la organización (gimnasio) |

```bash
cp .env.example .env
```

### Run

```bash
uv sync
uv run python main.py
```

---

## Modo DEMO

Por defecto `MODE_DEMO = True` en `main.py`. Genera datos sintéticos (nombres, accesos aleatorios) para testing sin hardware real. Cambiar a `False` para conectar con la API real.

---

## API consumida

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/access-control/sync-tasks?organizationId=...` | GET | Poll de tareas pendientes (cada 10s) |
| `/api/access-control/mark-synced` | POST | Confirmar tarea completada |
| `/api/access-control/verify` | POST | Validar acceso (solo vía QR en modo live) |

---

## Estados

- `granted` — Acceso permitido (suscripción activa)
- `denied` — Acceso denegado (sin suscripción/miembro inactivo)
- `error` — Error de lectura del dispositivo

---

## Deploy

Compilar a ejecutable standalone con Flet:

```bash
flet pack main.py
```

El binario se distribuye a cada gimnasio. Requiere conexión a internet para sincronizar con el cloud.