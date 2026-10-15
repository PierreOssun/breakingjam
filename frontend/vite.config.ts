/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
      "/api": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Lazy pages wait up to 5 s per findBy (setup.ts); the test needs room for several.
    testTimeout: 15_000,
    // Vitest blanks CSS by default; the token test needs the real stylesheet text.
    css: { include: [/src\/styles\/index\.css/] },
  },
});
