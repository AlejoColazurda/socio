import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { environment: "node", env: { SOCIO_MOCK: "1", SOCIO_STORE: "memory" } },
});
