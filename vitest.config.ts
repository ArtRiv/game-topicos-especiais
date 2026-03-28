import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 10000,
    exclude: ['game-server/**', 'node_modules/**'],
    alias: {
      phaser: resolve('./src/__mocks__/phaser.ts'),
    },
  },
});
