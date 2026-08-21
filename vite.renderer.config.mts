import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react(), {
    name: 'sfscreen-csp',
    transformIndexHtml: (html) => html
      .replace('%CONNECT_SRC%', command === 'serve' ? "'self' ws://localhost:* http://localhost:*" : "'self'")
      .replace('%STYLE_SRC%', command === 'serve' ? "'self' 'unsafe-inline'" : "'self'"),
  }],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../.vite/renderer/main_window',
    emptyOutDir: true,
  },
}));
