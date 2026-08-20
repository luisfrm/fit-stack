---
description: Audit UI/UX with the design reviewer agent
agent: ux-reviewer
---

Audit the UI/UX of the app. Focus on `$ARGUMENTS` if provided; otherwise review the key flows of the target app(s):
- **`apps/panel`** (gym admin): login → dashboard KPIs → crear miembro → asignar plan → registrar pago → permisos por rol (OWNER / MANAGER / CASHIER / COACH).
- **`apps/console`** (SaaS admin): organizaciones, planes de plataforma, suscripciones, staff.
- **`apps/web`** (portal miembro): landing CMS, perfil, suscripción activa.

Use the `@workspace/ui` design system as your criteria (tokens OKLCH, border radius scale, translucent borders, responsive `Modal` / `ResponsiveModal`). Report findings by impact with `archivo:línea` and concrete suggestions that use existing components and tokens. Do not edit files.
