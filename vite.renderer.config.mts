import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => ({
  plugins: [react(), {
    name: 'sfscreen-csp',
    transformIndexHtml: (html) => html
      .replace('%CONNECT_SRC%', "'self' http: https: ws: wss: data: blob:")
      .replace('%STYLE_SRC%', "'self' 'unsafe-inline'"),
  }],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../.vite/renderer/main_window',
    emptyOutDir: true,
  },
}));
