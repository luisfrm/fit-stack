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
      filter: (page) => !page.includes("/probar-demo"),
    }),
    icon({
      include: {
        lucide: [
          "arrow-right",
          "arrow-up-right",
          "badge-check",
          "banknote",
          "bell-ring",
          "brain",
          "calendar-days",
          "check",
          "chevron-down",
          "circle-check",
          "clock",
          "copy",
          "copy",
          "credit-card",
          "dumbbell",
          "file-text",
          "globe",
          "info",
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
          "triangle-alert",
          "users",
          "x",
          "zap",
        ],
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
