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
  optimizeDeps: {
    // Los paquetes del workspace se enlazan, así que Vite no los pre-empaqueta
    // al arrancar: descubre sus dependencias (`@openzeppelin/merkle-tree`,
    // `ethereum-cryptography`) en la primera navegación que las importa y
    // recarga la página entera a mitad de camino. Eso deja la pantalla en
    // blanco un instante y volvió intermitente un spec de Playwright.
    // Declararlos aquí los pre-empaqueta al arrancar el servidor.
    include: ['@app/borrowing-base', '@app/contracts', '@app/merkle'],
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
