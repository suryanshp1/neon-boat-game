import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tools/**', 'node_modules/**', 'dist/**'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          rapier: ['@dimforge/rapier3d-compat'],
        },
      },
    },
  },
});
