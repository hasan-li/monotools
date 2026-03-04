import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        json: path.resolve(__dirname, 'json/index.html'),
        color: path.resolve(__dirname, 'color/index.html'),
      },
    },
  },
  base: '/tools/',
});
