# commercial

Sitio comercial público de Fit-Stack. Astro 7, salida estática, sin framework de UI en el
cliente y desplegado en Cloudflare Workers (assets estáticos).

## Comandos

```bash
pnpm --filter commercial dev        # http://localhost:3002
pnpm --filter commercial build      # astro check + dist/
pnpm --filter commercial preview    # sirve dist/ en :3002
pnpm --filter commercial lint
pnpm --filter commercial typecheck
pnpm --filter commercial deploy     # wrangler deploy (Workers Assets)
```

## Estructura

```
src/
  config/site.ts        # URL canónica, metadatos, navegación y contacto (SSOT)
  styles/global.css     # tokens de @workspace/ui + tokens propios del sitio
  layouts/BaseLayout    # <html>, tema, SEO, header, main, footer
  components/
    layout/             # Header, Footer, ThemeToggle
    seo/SEO.astro       # title, description, canonical, OG/Twitter
    ui/                 # primitivas .astro (Button, Heading, Card, ...)
  pages/                # rutas
```

## Diseño

- Los tokens de color, radios y tipografía vienen de `@workspace/ui/globals.css`
  (`packages/ui/src/styles/globals.css`). No se declara una paleta paralela.
- `@workspace/ui` es React y no se monta en Astro: las primitivas de este sitio son
  componentes `.astro` que reproducen el mismo lenguaje visual con esos tokens.
- Tema: `light` por defecto, `dark` y `system` a elección del usuario. La preferencia se
  guarda en `localStorage` con la clave `fitstack-theme` (la misma que usan el panel y la
  consola) y se aplica con un script inline antes del primer pintado, sin parpadeo.
- Tipografía autoalojada con Fontsource (`DM Sans` cuerpo, `Space Grotesk` display). No hay
  peticiones a Google Fonts ni iconos de Material Symbols: los iconos son SVG de Lucide,
  renderizados en build por `astro-icon`.

## Despliegue

`wrangler.jsonc` describe un Worker solo de assets (`name: fitstack-commercial`,
`assets.directory: ./dist`). `wrangler deploy` crea el Worker y el bucket de assets la
primera vez; no se gestiona con Terraform. Las cabeceras de seguridad y caché viven en
`public/_headers` y se copian al build.

## Contenido

- Los precios publicados viven en `src/data/pricing.ts` y deben reflejar el catálogo de
  planes que administra la consola. Si cambian allí, se actualizan aquí.
- El formulario de demo es una captación: todavía no crea organizaciones.
