/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
    // Vitest blanks CSS by default; the token test needs the real stylesheet text.
    css: { include: [/src\/styles\/index\.css/] },
  },
});
