import { defineConfig } from "vitest/config";

// The pure helpers only; the Worker itself is checked end to end with `wrangler dev`.
export default defineConfig({
  test: { globals: true, include: ["tests/**/*.test.ts"] },
});
