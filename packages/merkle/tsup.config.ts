import { defineConfig } from 'tsup';

// Build dual CJS+ESM, igual que @app/contracts: la API (CommonJS) hace
// require() y Vite (ESM) hace import.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
