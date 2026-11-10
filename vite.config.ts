import { defineConfig } from "vite";

const host = "0.0.0.0";
const port = 4173;

export default defineConfig(({ mode }) => ({
  base: mode === "standalone" ? "./" : "/",
  build: mode === "standalone" ? { outDir: "dist/app" } : undefined,
  server: { host, port, strictPort: true },
  preview: { host, port, strictPort: true },
}));
