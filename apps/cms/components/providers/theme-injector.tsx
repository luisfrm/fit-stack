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

  const primary = settings[SETTINGS_KEYS.BRAND_PRIMARY] || (activeOrganizationId ? undefined : PLATFORM_PRIMARY);

  // While loading a gym's settings, we might not have 'primary' yet. 
  // We return null to let the Skeleton show the base colors without "flashing" a wrong custom color.
  if (!primary) return null;

  // Intelligent secondary variants calculation
  const hover = ColorUtils.getHoverColor(primary);
  const primaryFg = ColorUtils.getContrastForeground(primary);

  // We overwrite both the raw variable and the Tailwind-mapped variable
  // Note: V4 uses --primary as source of truth
  const css = `
    :root {
      ${primary ? `
        --primary: ${primary} !important; 
        --ring: ${primary} !important;
      ` : ""}
      ${hover ? `
        --primary-hover: ${hover} !important; 
      ` : ""}
      ${primaryFg ? `
        --primary-foreground: ${primaryFg} !important; 
      ` : ""}
    }
  `;

  return (
    <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: css }} />
  );
}
