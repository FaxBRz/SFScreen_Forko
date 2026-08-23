import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
  },
  build: {
    outDir: '.vite/build',
    emptyOutDir: false,
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['electron', 'loopback-capture'],
    },
  },
});
