# @workspace/ui

Sistema de diseño compartido basado en **shadcn/ui**. Contiene componentes React reutilizables (botones, modales, tablas, formularios, cards, etc.) y estilos globales.

---

## Entry Point

```tsx
import { Button } from "@workspace/ui/components/button"
import { Card, Modal, toast, Toaster } from "@workspace/ui/components"
```

---

## Cómo agregar componentes

```bash
pnpm dlx shadcn@latest add <component> -c apps/web
# El componente se coloca en packages/ui/src/components/
```

Todos los componentes se instalan en `packages/ui/src/components/`.

---

## Convenciones de diseño

### Backgrounds
- Fondos de inputs/elementos: `bg-input`
- Fondos de cards: `bg-card`
- Fondos de contenedores: `bg-surface`
- Translúcidos: `bg-white/5`, `bg-white/10`

### Borders
- Low opacity siempre: `border-white/5`, `border-white/10`, `border-input-border`
- **No** usar colores sólidos en borders. Solo en focus rings.

### Border Radius
| Elemento | Clase |
|----------|-------|
| Inputs, Buttons, CheckboxCards | `rounded-md` |
| Cards, Containers | `rounded-xl` |
| Modals, Dialogs | `rounded-2xl` |

---

## Tailwind

`tailwind.config.ts` y `globals.css` ya están configurados en cada app para usar los componentes del paquete.

## Dependencias

- `@radix-ui/*` (via shadcn/ui)
- `lucide-react`
- `tailwindcss`, `tailwindcss-animate`