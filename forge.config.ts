import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    icon: './assets/icon',
    asar: {
      unpack: '**/node_modules/loopback-capture/**',
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({
    setupIcon: './assets/icon.ico',
  })],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
  ],
};

export default config;
