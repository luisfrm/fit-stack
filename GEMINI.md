# Contexto del Proyecto: Fit-Stack

Este archivo proporciona las directrices fundamentales y el contexto arquitectónico para interactuar con el repositorio **Fit-Stack**.

## 1. Descripción General
**Fit-Stack** es un ecosistema basado en un monorepositorio (Turbo + pnpm) diseñado para la gestión de fitness y organizaciones. Utiliza un stack moderno centrado en TypeScript, Next.js y una arquitectura de servicios compartidos.

### Arquitectura (Monorepo)
- **`apps/`**: Aplicaciones finales.
  - `api`: Backend central (Next.js 15+ / API Routes) que maneja autenticación, lógica de negocio y servicios.
  - `web`: Frontend principal para usuarios y miembros.
  - `cms`: Panel de administración de contenido.
  - `bridge`: Aplicación de escritorio/puente escrita en **Python (Flet)**.
- **`packages/`**: Módulos compartidos y reutilizables.
  - `database`: Fuente de verdad de datos (Drizzle ORM + Neon/Postgres).
  - `ui`: Sistema de diseño basado en **shadcn/ui** y Tailwind CSS.
  - `shared`: Constantes (roles, campos), interfaces y lógica de negocio común.
  - `eslint-config` / `typescript-config`: Configuraciones de calidad de código.

## 2. Tecnologías Principales
- **Framework**: Next.js 15+ (con soporte para React 19).
- **Autenticación**: Better Auth (con plugin de `organization`).
- **Base de Datos**: Drizzle ORM (PostgreSQL vía Neon).
- **Estilos**: Tailwind CSS con un sistema de diseño premium (bordes sutiles, radios de curvatura específicos).
- **Gestión de Monorepo**: Turborepo y pnpm.

## 3. Comandos Clave
- `pnpm dev`: Inicia todos los servicios en modo desarrollo.
- `pnpm build`: Compila todas las aplicaciones y paquetes.
- `pnpm lint`: Ejecuta el análisis de linter en todo el monorepo.
- `pnpm db:generate`: Genera nuevas migraciones de Drizzle.
- `pnpm db:migrate`: Aplica las migraciones a la base de datos (Requiere aprobación).
- `pnpm db:studio`: Abre la interfaz visual de Drizzle para explorar datos.

## 4. Convenciones y Reglas de Oro (Obligatorias)
- **Idioma**: Los planes de implementación DEBEN redactarse en **Español**.
- **Aprobación**: Siempre solicita aprobación explícita antes de ejecutar cambios en el código o la base de datos.
- **Base de Datos**: 
  - Tablas en **singular** (ej: `user`).
  - Servicios/Repositorios en **plural** (ej: `users.service.ts`).
  - Prohibido usar `db:push` en ramas compartidas o producción.
- **Componentes UI**: Importar exclusivamente de `@workspace/ui`. No usar clases ad-hoc de Tailwind para tamaños/espacios base si existe un token.
- **Autenticación**:
  - Cliente: Usar siempre el hook personalizado `useAuth()`. NUNCA `useSession()` directamente.
  - Servidor: Usar `session-service.ts` para obtener la sesión isomórfica.
- **Tipo de Datos**: Prohibido el uso de `any`. Priorizar tipado estricto en `@workspace/shared`.
- **Next.js**: Tratar todo como Server Component por defecto. Mantener `"use client"` solo en los nodos hoja (leaf nodes).

## 5. Estructura de Datos Crítica
La tabla `organization` (manejada por Better Auth) es la **única fuente de verdad** para la identidad (Nombre/Logo). No duplicar esta información en otras tablas de configuración.
