# Fit-Stack Web

Sitio público de Fit-Stack + renderizado de páginas CMS dinámicas por organización. Next.js 16 con componentes `@workspace/ui`.

**Puerto:** 3002

---

## Quick Start

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ | API URL (default: `http://localhost:3000`) |

```bash
cp .env.example .env
```

### Run

```bash
pnpm dev          # Dev server (Turbopack, port 3002)
pnpm build        # Production build
pnpm start        # Production server
pnpm typecheck    # TypeScript check
pnpm lint         # ESLint
```

---

## Páginas

### Landing estática (`/`)
Hero + servicios + funcionalidades + cómo funciona + testimonios. Muestra el producto Fit-Stack.

### Páginas CMS dinámicas (futuro)
Las páginas CMS creadas en `apps/cms` se renderizan aquí mediante `GET /api/public/pages/[slug]`, pasando el header `x-organization-id`.

---

## Deploy

- Hospedaje público (Vercel recomendado)
- Para páginas CMS: configurar edge caching para `/api/public/pages/[slug]`