import { parse, formatHex, formatRgb, formatCss, converter, modeOklch, useMode as culoriUseMode } from 'culori';

// Activa el modo OKLCH en culori
culoriUseMode(modeOklch);

/**
 * Utility class for color format conversions and validations.
 * Powered by Culori for Elite Fitness (Native OKLCH focus).
 */
const toOklch = converter('oklch');

export const ColorUtils = {
  /**
   * Converts any valid color string to OKLCH format.
   * Format: oklch(L C H) or oklch(L C H / A)
   */
  toOklch: (color: string) => {
    const parsed = parse(color);
    if (!parsed) return "";
    return formatCss(toOklch(parsed));
  },

  /**
   * Generates a hover variant by shifting the lightness (L) in OKLCH.
   * If the color is light (L > 0.4), it darkens it. If dark, it lightens it.
   */
  getHoverColor: (color: string) => {
    const parsed = parse(color);
    if (!parsed) return "";
    
    const oklch = toOklch(parsed);
    if (!oklch) return "";

    // L (lightness) shift (approx 8-10%)
    if (oklch.l > 0.4) {
      oklch.l = Math.max(0, oklch.l - 0.08); // Darken
    } else {
      oklch.l = Math.min(1, oklch.l + 0.12); // Lighten
    }

    return formatCss(oklch);
  },

  /**
   * Calculates a suitable foreground color (black or white) based on contrast.
   */
  getContrastForeground: (color: string) => {
    const parsed = parse(color);
    if (!parsed) return "oklch(0 0 0)"; // Default black
    
    const oklch = toOklch(parsed);
    if (!oklch) return "oklch(0 0 0)";

    // If lightness is more than 50%, return black, else return white.
    return oklch.l > 0.5 ? "oklch(0 0 0)" : "oklch(1 0 0)";
  },

  /**
   * Converts any valid color string to HEX format.
   */
  toHex: (color: string) => {
    const parsed = parse(color);
    if (!parsed) return "";
    return formatHex(parsed);
  },

  /**
   * Converts any valid color string to RGBA format.
   */
  toRgba: (color: string) => {
    const parsed = parse(color);
    if (!parsed) return "";
    return formatRgb(parsed);
  },

  /**
   * Validates if a string is a valid color.
   */
  isValid: (color: string) => !!parse(color),

  /**
   * Returns the color format.
   */
  detectFormat: (color: string) => {
    if (color.startsWith("oklch")) return "oklch" as const;
    if (color.startsWith("#")) return "hex" as const;
    if (color.startsWith("rgb")) return "rgba" as const;
    return "unknown" as const;
  },

  /**
   * Normalizes color string for UI display based on target format.
   */
  formatForDisplay: (color: string, targetFormat: "hex" | "rgba" | "oklch") => {
    if (!color) return "";
    switch (targetFormat) {
      case "hex": return ColorUtils.toHex(color);
      case "rgba": return ColorUtils.toRgba(color);
      case "oklch": return ColorUtils.toOklch(color);
      default: return color;
    }
  }
};
