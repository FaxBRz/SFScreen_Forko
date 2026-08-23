import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isStandalone = process.env.SFSCREEN_STANDALONE === '1';
  return {
    define: isStandalone ? {
      MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
      MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'),
    } : {},
    build: {
      outDir: '.vite/build',
      emptyOutDir: false,
      lib: {
        entry: 'src/main/main.ts',
        formats: ['cjs'],
        fileName: () => 'main.js',
      },
      rollupOptions: {
        // The main process runs in Node/Electron, not in the browser. Keeping
        // Node built-ins external prevents Vite from replacing them with empty
        // browser shims in the standalone portable build.
        external: ['electron', 'loopback-capture', /^node:/],
      },
    },
  };
});
