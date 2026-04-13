import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ColorUtils } from "@workspace/ui/lib/color-utils";
import { useAuth } from "@/lib/hooks/use-auth";

/**
 * ThemeInjector - Dynamically applies gym branding colors to CSS variables.
 * This ensures that changes in the settings are reflected across the entire app
 * without a page reload or CSS recompilation.
 * Now handles intelligent hover and contrast calculation via OKLCH.
 */
export function ThemeInjector() {
  const { settings } = useSettings();
  const { activeOrganization } = useAuth();
  const activeOrganizationId = activeOrganization?.id;

  // Fit-Stack Default Branding (sync with globals.css)
  const PLATFORM_PRIMARY = "oklch(0.853 0.199 91.26)";

  const primary = (activeOrganizationId && settings[SETTINGS_KEYS.BRAND_PRIMARY]) || PLATFORM_PRIMARY;

  // Intelligent secondary variants calculation
  const hover = ColorUtils.getHoverColor(primary);
  const primaryFg = ColorUtils.getContrastForeground(primary);
  const borderPrimary = ColorUtils.getAlphaVariant(primary, 0.4);
  const primaryGlow = ColorUtils.getAlphaVariant(primary, 0.08);
  const primaryGlowHover = ColorUtils.getAlphaVariant(primary, 0.15);

  // We overwrite the raw variables to affect both standard and custom components
  const css = `
    :root {
      --primary: ${primary} !important; 
      --primary-hover: ${hover} !important; 
      --primary-foreground: ${primaryFg} !important;
      --border-primary: ${borderPrimary} !important;
      --primary-glow: ${primaryGlow} !important;
      --primary-glow-hover: ${primaryGlowHover} !important;
      --ring: ${primary} !important;
    }
  `;

  return (
    <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: css }} />
  );
}
