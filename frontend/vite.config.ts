/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  build: {
    // 271 flags would bloat the bundle as data URIs; keep each a file fetched when shown.
    assetsInlineLimit: (file) =>
      file.includes("flag-icons") ? false : undefined,
  },
  server: {
    port: 5173,
    // Tests read ../DESIGN.md (token sync); the dev server never serves the repo root.
    fs: { allow: [process.env.VITEST ? ".." : "."] },
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        // Cloudflare tells the API the visitor's country in production; DEV_COUNTRY stands in.
        headers: countryHeader(loadEnv(mode, process.cwd(), "").DEV_COUNTRY),
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Lazy pages wait up to 5 s per findBy (setup.ts); the test needs room for several.
    testTimeout: 15_000,
    // Vitest blanks CSS by default; the token test needs the real stylesheet text.
    css: { include: [/src\/styles\/index\.css/] },
  },
}));

function countryHeader(country: string | undefined): Record<string, string> {
  return country ? { "cf-ipcountry": country } : {};
}
