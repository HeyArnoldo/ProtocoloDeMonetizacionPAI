import { defineConfig } from 'tsup';

// Build dual CJS+ESM: la API (CommonJS) hace require() y Vite (ESM) hace import.
// Sin el formato CJS, la API no puede consumir los schemas en runtime.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
});
