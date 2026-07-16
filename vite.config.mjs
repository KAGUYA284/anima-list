import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'www',
  base: './',
  build: {
    outDir: resolve('dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve('www/index.html'),
    },
  },
  server: {
    port: 5173,
  },
});
