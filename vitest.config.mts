import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Même alias que tsconfig.json : `@/…` désigne `src/…`.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` est fourni par Next.js à la compilation, absent de
      // node_modules : un module vide le remplace dans les tests.
      "server-only": fileURLToPath(new URL("./tests/aides/module-vide.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
