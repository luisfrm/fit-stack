// ─────────────────────────────────────────────
// @workspace/ui/next — Next.js-only components
// ─────────────────────────────────────────────
//
// Nothing in this folder may be re-exported from the framework-agnostic barrel
// (`@workspace/ui/components`): each one imports `next/*`, so pulling it into a
// non-Next consumer (e.g. the React Router portal) breaks its build.
// Consumers opt in explicitly with `@workspace/ui/next` or a deep path such as
// `@workspace/ui/components/next/image`.

export { AppSidebar, MobileNav, SettingsSidebar } from "@workspace/ui/components/next/sidebar";
export type {
  SidebarUser,
  SidebarNavItem,
  SidebarBranding,
  SidebarThemeToggle,
  SettingsSidebarItem,
} from "@workspace/ui/components/next/sidebar";
export { NavTabs } from "@workspace/ui/components/next/nav-tabs";
export { NextImage } from "@workspace/ui/components/next/image";
