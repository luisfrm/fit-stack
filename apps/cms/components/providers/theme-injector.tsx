import * as React from "react";
import { useSettings, SETTINGS_KEYS } from "@/lib/hooks/use-settings";
import { ColorUtils } from "@workspace/ui/lib/color-utils";

/**
 * ThemeInjector - Dynamically applies gym branding colors to CSS variables.
 * This ensures that changes in the settings are reflected across the entire app
 * without a page reload or CSS recompilation.
 * Now handles intelligent hover and contrast calculation via OKLCH.
 */
export function ThemeInjector() {
  const { settings } = useSettings();

  const primary = settings[SETTINGS_KEYS.BRAND_PRIMARY];

  // If no custom branding is set, don't inject anything (avoiding empty style tag)
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
