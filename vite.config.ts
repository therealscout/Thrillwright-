import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Relative base so the build works on GitHub Pages under any repo path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Three.js changes rarely: keep it in its own file so browsers can
        // cache it across game updates.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/preact')) return 'preact';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
