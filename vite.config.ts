import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        json: path.resolve(import.meta.dirname, 'json/index.html'),
        color: path.resolve(import.meta.dirname, 'color/index.html'),
        diff: path.resolve(import.meta.dirname, 'diff/index.html'),
      },
    },
  },
  base: '/monotools/',
});
