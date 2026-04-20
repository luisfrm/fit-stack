---
name: project-theme
description: Estándares de consistencia visual, tokens de fondo, jerarquía de radios y comportamiento dinámico de temas (Light/Dark).
---

# Fit-Stack Theme & Synergy Rules

Para mantener la sinergia visual y evitar la "ensalada de estilos" (inconsistencia), todos los componentes deben seguir esta distribución semántica y de variantes.

## 1. El Contrato de Variantes

Los componentes NO deben definir estilos arbitrarios. Deben exponer una prop `variant` que mapee a estos comportamientos:

| Variante | Look & Feel | Tokens Técnicos |
| :--- | :--- | :--- |
| **`glass`** | Firma visual del CMS. Translúcido y premium. | `bg-glass`, `backdrop-blur-md`, `border-white/10`. |
| **`default` / `plain`** | Sólido y técnico. Máxima legibilidad. | `bg-surface` o `bg-card`, `border-border`. |
| **`input`** | Campos de entrada. | `bg-input`, `border-input-border`. |

## 2. Jerarquía Matemática de Radios (Border Radius)

La escala es estricta para garantizar un ritmo visual coherente:
- **`rounded-md` (8px)**: Controles internos y elementos de acción pequeña (Botones, Inputs, CheckboxCards, Triggers de Select).
- **`rounded-xl` (12px)**: Contenedores intermedios y superficies informativas (Cards, Gráficos, Tooltips densos, Menús desplegables).
- **`rounded-2xl` (16px)**: Superficies parentales y de gran escala (Modales, Diálogos, Paneles de Configuración).

## 3. Distribución Semántica de Fondos

- **`bg-glass`**: Estándar para contenedores de Dashboard y tablas.
- **`bg-surface`**: Superficies que deben "resaltar" del fondo (pop-out). Úsalo para SelectContent, Popovers y Footers de Modal.
- **`bg-card`**: Contenedores de contenido sólido.

## 4. Sistema Dinámico y Modo Light

Fit-Stack NO utiliza el patrón estándar `dark:` de Tailwind para el branding, ya que el tema es dinámico por organización.

### Reglas del Modo Light:
- **Inyección por Clase**: El modo light se activa mediante la clase `.light` en el elemento `<html>`.
- **Primary customizable**: El color `--primary` se inyecta dinámicamente vía `ThemeInjector`.
- **Cálculo de Legibilidad**: Los estados (hover, foreground de contraste, glow) NO se hardcodean. Se calculan usando **OKLCH** basándose en la luminosidad del `--primary` activo para garantizar que el texto siempre sea legible.
- **Tokens Específicos**: El modo Light usa `--foreground-strong` para máximo énfasis y ajusta las opacidades de los bordes para mantener la sutileza sin el brillo del Dark mode.

## 5. Regla de "Cero Hardcodeo" de Color
Está **ESTRICTAMENTE PROHIBIDO** usar clases arbitrarias de Tailwind (ej. `bg-blue-500`) para colores de marca o superficies. Usa siempre los tokens semánticos definidos para que el `ThemeInjector` pueda controlarlos.
