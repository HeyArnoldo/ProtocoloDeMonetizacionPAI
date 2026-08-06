import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Las VITE_* viven en el .env único de la raíz del repo.
  envDir: '../..',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // En dev el frontend pega a /api (mismo origen) y Vite lo proxea a la API:
    // sin CORS y la cookie httpOnly viaja sola.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
