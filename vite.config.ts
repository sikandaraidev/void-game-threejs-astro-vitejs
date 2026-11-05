import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
    // three/webgpu is ~840 KB raw; the real gate is the gzip budget in scripts/check-size.mjs.
    chunkSizeWarningLimit: 1000,
  },
  css: {
    modules: {
      localsConvention: 'camelCaseOnly',
    },
  },
});
