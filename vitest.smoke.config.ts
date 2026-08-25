import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/smoke/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
