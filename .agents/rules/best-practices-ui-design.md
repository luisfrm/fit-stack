---
name: best-practices-ui-design
description: Premium design system standards, variant-based UI development, and OKLCH color synergy.
---

# UI Design System & Synergy

Deliver a premium, consistent user experience by adhering to the Fit-Stack design tokens and the **Zero Hardcode Policy**.

## 1. Zero Hardcode Policy
Custom Tailwind classes for spacing, colors, or sizes (e.g., `h-[48px]`, `bg-[#f00]`) are prohibited.
- **Components over Classes**: Use the predefined `variant` and `size` props on our core components.
- **Token Usage**: Only use generic tokens like `bg-glass`, `bg-surface`, or `bg-input` to ensure the interface responds correctly to dynamic organization themes.

## 2. Component Hierarchy
Import components strictly from `@workspace/ui/components`.

### Layout Surfaces
- **`glass`**: The "Signature" of the CMS. High translucency and blur. Use for Dashboard containers and tables.
- **`surface`**: Pop-out background. Use for dropdowns, popovers, and footer actions.
- **`card`**: Standard solid containers.

### Mathematical Border Radii
Maintain visual rhythm by using the correct scale:
- **`rounded-md` (8px)**: Small controls (Buttons, Inputs, Triggers).
- **`rounded-xl` (12px)**: Intermediate surfaces (Cards, Charts).
- **`rounded-2xl` (16px)**: Large parent surfaces (Modals, Dialogs).

## 3. Dynamic Branding & OKLCH
Fit-Stack uses organization-specific primary colors.
- **OKLCH Synergy**: State variations (hover, active, foreground contrast) are calculated mathematically based on the primary color's lightness.
- **Light/Dark Logic**: The theme is toggled via the `.light` class on the root element. Never hardcode colors—use semantic variables so the system can adapt.

## 4. Typography
- **`<Title>`**: For all headers. Follow the semantic hierarchy (as="h1", as="h2").
- **`<Text>`**: For body copy, captions, and labels. Avoid raw `<p>` or `<span>` without consistent classes.
