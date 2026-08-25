import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: false,
  clean: true,
  dts: false,
  format: ['esm'],
  target: 'es2022',
  treeshake: true,
});
