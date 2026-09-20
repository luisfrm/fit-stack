---
description: Audit UI/UX with the design reviewer agent
agent: ux-reviewer
---

Audit the UI/UX of the app. Focus on `$ARGUMENTS` if provided; otherwise review the key flows of the target app(s):

- **`apps/panel`** (gym admin): login → dashboard KPIs → create member → assign plan → register payment → role permissions (OWNER / MANAGER / CASHIER / COACH).
- **`apps/console`** (SaaS admin): organizations, platform plans, subscriptions, staff.
- **`apps/web`** (member portal): CMS landing, profile, active subscription.

Use the `@workspace/ui` design system as your criteria (OKLCH tokens, border radius scale, translucent borders, responsive `Modal` / `ResponsiveModal`). Report findings by impact with `file:line` and concrete suggestions that use existing components and tokens. Do not edit files.

Respond in English.
