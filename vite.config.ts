import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// Relative base so the build works on GitHub Pages under any repo path.
export default defineConfig({
  base: './',
  plugins: [preact()],
  build: {
    target: 'es2022',
    sourcemap: true,
    // Three.js alone is ~600 kB minified; split it out in a later milestone.
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
