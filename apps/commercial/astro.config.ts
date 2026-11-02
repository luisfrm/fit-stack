import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";

import { SITE } from "./src/config/site";

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  output: "static",
  trailingSlash: "ignore",
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    sitemap({
      // `/probar-demo` is noindex: it must not appear in the sitemap either.
      filter: (page) => !page.includes("/probar-demo"),
      lastmod: new Date(),
    }),
    icon({
      include: {
        // Exactly the icons the site renders; keep it alphabetical.
        lucide: [
          "arrow-right",
          "arrow-up-right",
          "badge-check",
          "banknote",
          "bell-ring",
          "calendar-days",
          "check",
          "chevron-down",
          "circle-check",
          "clock",
          "copy",
          "dumbbell",
          "file-text",
          "globe",
          "laptop",
          "layout-dashboard",
          "line-chart",
          "lock",
          "mail",
          "menu",
          "moon",
          "receipt",
          "shield-check",
          "smartphone",
          "sparkles",
          "sun",
          "users",
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
