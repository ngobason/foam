import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Use the monorepo source directly, without relying on an installed link.
      '@foam/core': fileURLToPath(
        new URL('../../packages/foam-core/src/index.ts', import.meta.url)
      ),
    },
  },
  optimizeDeps: {
    include: ['@foam/core'],
  },
});
