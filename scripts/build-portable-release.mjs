import { execSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

console.log('🚀 Iniciando build da versão Portable do SFScreen...');

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'out');
const portableDir = path.join(outDir, 'SFScreen-win32-x64');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const zipFile = path.join(outDir, `SFScreen-${pkg.version}-Portable-x64.zip`);

// 1. Build Vite bundles
console.log('📦 Compilando bundles de produção com Vite...');
execSync('npx vite build --config vite.main.config.mts', { stdio: 'inherit', env: { ...process.env, SFSCREEN_STANDALONE: '1' } });
execSync('npx vite build --config vite.preload.config.mts', { stdio: 'inherit', env: { ...process.env, SFSCREEN_STANDALONE: '1' } });
execSync('npx vite build --config vite.renderer.config.mts', { stdio: 'inherit', env: { ...process.env, SFSCREEN_STANDALONE: '1' } });
fs.copyFileSync(
  path.join(rootDir, 'src', 'main', 'input', 'native-input-helper.cs'),
  path.join(rootDir, '.vite', 'build', 'native-input-helper.cs'),
);
fs.copyFileSync(
  path.join(rootDir, 'src', 'main', 'audio', 'audio-session-helper.cs'),
  path.join(rootDir, '.vite', 'build', 'audio-session-helper.cs'),
);

// 2. Preparar diretório out
try {
  execSync('taskkill /F /IM SFScreen.exe /T', { stdio: 'ignore' });
} catch {
  // Ignored if not running
}

if (fs.existsSync(portableDir)) {
  console.log('🧹 Limpando build anterior...');
  try {
    fs.rmSync(portableDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch {
    // Fallback if directory partially locked
  }
}
fs.mkdirSync(portableDir, { recursive: true });

// 3. Copiar distribuição do Electron
const electronDist = path.join(rootDir, 'node_modules', 'electron', 'dist');
console.log('📂 Copiando binários do Electron para', portableDir);
fs.cpSync(electronDist, portableDir, { recursive: true });

// 4. Renomear electron.exe para SFScreen.exe
const originalExe = path.join(portableDir, 'electron.exe');
const targetExe = path.join(portableDir, 'SFScreen.exe');
if (fs.existsSync(originalExe)) {
  fs.renameSync(originalExe, targetExe);
}

// 5. Atualizar metadados e ícone com rcedit
const rceditPath = path.join(rootDir, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
const iconPath = path.join(rootDir, 'assets', 'icon.ico');

if (fs.existsSync(rceditPath) && fs.existsSync(iconPath)) {
  console.log('🎨 Aplicando ícone e metadados no SFScreen.exe...');
  try {
    const windowsVersion = `${pkg.version}.0`;
    execSync(`"${rceditPath}" "${targetExe}" --set-icon "${iconPath}" --set-version-string "ProductName" "SFScreen" --set-version-string "FileDescription" "SFScreen" --set-version-string "CompanyName" "SFScreen" --set-version-string "LegalCopyright" "SFScreen Contributors" --set-file-version "${windowsVersion}" --set-product-version "${windowsVersion}"`, { stdio: 'inherit' });
  } catch (err) {
    console.warn('Aviso: rcedit encontrou um erro não crítico:', err);
  }
}

// 6. Preparar resources/app
const appResourcesDir = path.join(portableDir, 'resources', 'app');
fs.mkdirSync(appResourcesDir, { recursive: true });

// Copiar .vite
fs.cpSync(path.join(rootDir, '.vite'), path.join(appResourcesDir, '.vite'), { recursive: true });

// Copiar assets
fs.cpSync(path.join(rootDir, 'assets'), path.join(appResourcesDir, 'assets'), { recursive: true });

// Copiar package.json
const prodPkg = {
  name: pkg.name,
  productName: pkg.productName,
  version: pkg.version,
  main: '.vite/build/main.js',
  dependencies: pkg.dependencies || {},
};
fs.writeFileSync(path.join(appResourcesDir, 'package.json'), JSON.stringify(prodPkg, null, 2), 'utf8');

// Copiar node_modules/loopback-capture se existir
const loopbackDir = path.join(rootDir, 'node_modules', 'loopback-capture');
if (fs.existsSync(loopbackDir)) {
  const targetLoopback = path.join(appResourcesDir, 'node_modules', 'loopback-capture');
  fs.mkdirSync(path.dirname(targetLoopback), { recursive: true });
  fs.cpSync(loopbackDir, targetLoopback, { recursive: true });
}

// 7. Criar arquivo ZIP portátil para fácil download/distribuição
console.log('🗜️ Criando arquivo zip portátil...');
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}

try {
  execSync(`tar -a -c -f "${zipFile}" -C "${portableDir}" .`, { stdio: 'inherit' });
  console.log(`✅ ZIP criado com sucesso em: ${zipFile}`);
} catch {
  try {
    execSync(`powershell -Command "Compress-Archive -Path '${portableDir}\\*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
    console.log(`✅ ZIP criado com sucesso em: ${zipFile}`);
  } catch (err) {
    console.warn('Aviso ao criar zip:', err);
  }
}

console.log('🎉 Build portátil concluído com sucesso!');
console.log(`📁 Executável portátil: ${targetExe}`);
console.log(`📦 Pacote compactado: ${zipFile}`);
