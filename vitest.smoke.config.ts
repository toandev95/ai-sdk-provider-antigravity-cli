import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/smoke/**/*.test.ts'],
    reporters: ['verbose'],
    testTimeout: 120_000,
  },
});
