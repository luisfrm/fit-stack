# Backlog — Storage (R2)

> Pendientes tras el corte de taxonomía de keys en R2.
> Volver al [[backlog/README|índice del backlog]].

La taxonomía pasó de `cms/<orgId>/…` a **`<orgId>/<folder>/…`** con corte limpio (sin compatibilidad).

## 1. Re-subida de assets existentes

- [ ] **Re-subir assets existentes**: las filas que guardan keys viejas (`gym_member.imageUrl`, `organization.logo`, JSON de bloques CMS, `paymentMethodDetails` con archivos) apuntan a keys que el route público ya no sirve → se ven rotas hasta re-subirlas. En la org de demo: `pnpm seed:e2e` (o re-subir a mano desde el panel/console).
- [ ] **Migración física opcional en R2**: si algún ambiente tiene assets que merece la pena conservar, copiar `cms/<orgId>/x` → `<orgId>/cms/x` y actualizar las referencias en DB. No se incluyó ningún script para esto (decisión: corte limpio).
- [ ] **`paymentMethodDetails` históricos**: las capturas de pago emitidas antes del cambio viven bajo `cms/<orgId>/receipts/…`; quedan visibles solo si se re-suben (el namespace viejo ya no es alcanzable).
  - **Disparador**: antes de abrir un ambiente con datos reales que use assets cargados antes del corte.
