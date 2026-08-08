import { defineConfig } from 'tsup';

// Build dual CJS+ESM, igual que el resto de packages: la API es CommonJS y
// Vite es ESM.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
