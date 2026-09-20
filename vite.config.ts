import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/mini-market-game/',
  build: {
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    chunkSizeWarningLimit: 1600,
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
