import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig({
  resolve: viteConfig.resolve,
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
