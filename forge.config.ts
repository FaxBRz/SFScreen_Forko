import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { readFileSync } from 'node:fs';
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
  dependencies: Record<string, string>;
};

const windowsCertificate = process.env.SFSCREEN_CERTIFICATE_FILE
  ? {
      certificateFile: process.env.SFSCREEN_CERTIFICATE_FILE,
      certificatePassword: process.env.SFSCREEN_CERTIFICATE_PASSWORD,
    }
  : {};

const runtimeModules = new Set([
  'bindings',
  'file-uri-to-path',
  'loopback-capture',
]);

const copyRuntimeHelpers = async (buildPath: string): Promise<void> => {
  const buildDirectory = path.join(buildPath, '.vite', 'build');
  const modulesDirectory = path.join(buildPath, 'node_modules');
  await mkdir(modulesDirectory, { recursive: true });
  await Promise.all([
    copyFile('src/main/input/native-input-helper.cs', path.join(buildDirectory, 'native-input-helper.cs')),
    copyFile('src/main/audio/audio-session-helper.cs', path.join(buildDirectory, 'audio-session-helper.cs')),
    ...[...runtimeModules].map((moduleName) => cp(
      path.join('node_modules', moduleName),
      path.join(modulesDirectory, moduleName),
      { recursive: true },
    )),
  ]);
};

const trimRuntimeModules = async (buildPath: string): Promise<void> => {
  const modulesDirectory = path.join(buildPath, 'node_modules');
  for (const entry of await readdir(modulesDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || runtimeModules.has(entry.name)) continue;
    await rm(path.join(modulesDirectory, entry.name), { recursive: true, force: true });
  }

  const packagedManifestPath = path.join(buildPath, 'package.json');
  const packagedManifest = JSON.parse(await readFile(packagedManifestPath, 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  packagedManifest.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).filter(([name]) => runtimeModules.has(name)),
  );
  await writeFile(packagedManifestPath, `${JSON.stringify(packagedManifest, null, 2)}\n`, 'utf8');
};

const trimElectronLocales = async (buildPath: string, platform: string): Promise<void> => {
  if (platform !== 'win32') return;
  const localesDirectory = path.join(buildPath, 'locales');
  for (const entry of await readdir(localesDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'en-US.pak' || entry.name === 'pt-BR.pak') continue;
    await rm(path.join(localesDirectory, entry.name), { force: true });
  }
};

const config: ForgeConfig = {
  packagerConfig: {
    icon: './assets/icon',
    executableName: 'SFScreen',
    asar: {
      unpack: '**/node_modules/loopback-capture/build/Release/*.node',
    },
  },
  rebuildConfig: {},
  makers: [new MakerSquirrel({
    name: 'SFScreen',
    title: 'SFScreen',
    exe: 'SFScreen.exe',
    setupExe: `SFScreen-${packageJson.version}-Setup-x64.exe`,
    setupIcon: './assets/icon.ico',
    // The custom green loading GIF looked like a terminal/failed setup and
    // vanished as Squirrel launched the app. Let the native installer show
    // its standard progress UI instead.
    noMsi: true,
    ...windowsCertificate,
  })],
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath) => copyRuntimeHelpers(buildPath),
    packageAfterPrune: async (_forgeConfig, buildPath) => trimRuntimeModules(buildPath),
    packageAfterExtract: async (_forgeConfig, buildPath, _electronVersion, platform) => trimElectronLocales(buildPath, platform),
  },
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
