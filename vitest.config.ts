import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    testTimeout: 15_000,
    hookTimeout: 15_000,
    fileParallelism: false
  }
});
