import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/stdio.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  outDir: "dist",
});
