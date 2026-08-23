import { spawnSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repository = 'FaxBRz/SFScreen_Forko';
const rootDirectory = process.cwd();
const packagePath = path.join(rootDirectory, 'package.json');
const lockPath = path.join(rootDirectory, 'package-lock.json');
const npmCliPath = process.env.npm_execpath;
const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';
const ghCommand = process.platform === 'win32' ? 'gh.exe' : 'gh';

process.on('uncaughtException', (error) => {
  console.error(`\nRelease cancelada: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? `\n${result.stderr || result.stdout}` : '';
    throw new Error(`${command} ${args.join(' ')} falhou com código ${result.status}.${detail}`);
  }
  return result;
};

const output = (command, args) => run(command, args, { capture: true }).stdout.trim();
const runNpm = (args) => {
  if (!npmCliPath) throw new Error('Execute este script por meio de npm run release.');
  return run(process.execPath, [npmCliPath, ...args]);
};

const parseVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Versão inválida: ${version}. Use patch, minor, major ou X.Y.Z.`);
  return match.slice(1).map(Number);
};

const resolveVersion = (requested, current) => {
  if (!['patch', 'minor', 'major'].includes(requested)) return requested;
  const [major, minor, patch] = parseVersion(current);
  if (requested === 'major') return `${major + 1}.0.0`;
  if (requested === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

const compareVersions = (left, right) => {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
};

const requestedVersion = process.argv[2];
if (!requestedVersion) {
  console.error('Uso: npm run release -- patch  (ou minor, major, X.Y.Z)');
  process.exit(1);
}
if (process.platform !== 'win32') {
  console.error('A release Windows deve ser gerada em uma máquina Windows.');
  process.exit(1);
}

const originalPackage = fs.readFileSync(packagePath, 'utf8');
const originalLock = fs.readFileSync(lockPath, 'utf8');
const currentPackage = JSON.parse(originalPackage);
const version = resolveVersion(requestedVersion, currentPackage.version);
parseVersion(version);
if (compareVersions(version, currentPackage.version) <= 0) {
  console.error(`A nova versão ${version} deve ser maior que ${currentPackage.version}.`);
  process.exit(1);
}

const tag = `v${version}`;
const branch = output(gitCommand, ['branch', '--show-current']);
if (!branch) throw new Error('Não é possível lançar uma release em detached HEAD.');
if (output(gitCommand, ['status', '--porcelain'])) {
  throw new Error('A árvore de trabalho precisa estar limpa antes da release. Faça commit das alterações primeiro.');
}
if (output(gitCommand, ['tag', '--list', tag])) throw new Error(`A tag ${tag} já existe localmente.`);
if (run(gitCommand, ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${tag}`], { capture: true, allowFailure: true }).status === 0) {
  throw new Error(`A tag ${tag} já existe no GitHub.`);
}

run(ghCommand, ['auth', 'status']);
const repositoryInfo = JSON.parse(output(ghCommand, ['repo', 'view', repository, '--json', 'isPrivate,nameWithOwner']));
if (repositoryInfo.isPrivate) throw new Error('O update público exige que o repositório permaneça público.');

console.log(`\nPreparando SFScreen ${tag} a partir da branch ${branch}...\n`);
runNpm(['run', 'typecheck']);
runNpm(['run', 'lint']);
runNpm(['test']);

let versionChanged = false;
let releaseCommitCreated = false;
try {
  versionChanged = true;
  runNpm(['version', version, '--no-git-tag-version']);
  runNpm(['run', 'make']);
  runNpm(['run', 'test:e2e:packaged']);

  const artifactDirectory = path.join(rootDirectory, 'out', 'make', 'squirrel.windows', 'x64');
  const artifacts = [
    path.join(artifactDirectory, `SFScreen-${version}-Setup-x64.exe`),
    path.join(artifactDirectory, `SFScreen-${version}-Setup-x64.exe.sha256`),
    path.join(artifactDirectory, `SFScreen-${version}-full.nupkg`),
    path.join(artifactDirectory, 'RELEASES'),
    path.join(artifactDirectory, 'SHA256SUMS.txt'),
  ];
  for (const artifact of artifacts) {
    if (!fs.existsSync(artifact) || fs.statSync(artifact).size === 0) {
      throw new Error(`Artefato ausente ou vazio: ${artifact}`);
    }
  }
  const releasesManifest = fs.readFileSync(path.join(artifactDirectory, 'RELEASES'), 'utf8');
  if (!releasesManifest.includes(`SFScreen-${version}-full.nupkg`)) {
    throw new Error('O RELEASES não referencia o pacote da versão atual.');
  }

  run(gitCommand, ['add', '--', 'package.json', 'package-lock.json']);
  run(gitCommand, ['commit', '-m', `chore(release): ${tag}`]);
  releaseCommitCreated = true;
  run(gitCommand, ['tag', '-a', tag, '-m', `SFScreen ${version}`]);
  run(gitCommand, ['push', '--atomic', 'origin', `${branch}:${branch}`, tag]);
  run(ghCommand, [
    'release', 'create', tag,
    '--repo', repository,
    '--verify-tag',
    '--latest',
    '--fail-on-no-commits',
    '--title', `SFScreen ${tag}`,
    '--generate-notes',
    `${artifacts[0]}#Instalador Windows x64`,
    `${artifacts[1]}#SHA-256 do instalador`,
    `${artifacts[2]}#Pacote Squirrel para updates`,
    `${artifacts[3]}#Índice do feed Squirrel`,
    `${artifacts[4]}#Checksums SHA-256`,
  ]);

  console.log(`\nRelease ${tag} publicada. Os aplicativos instalados receberão o update automaticamente.\n`);
} catch (error) {
  if (versionChanged && !releaseCommitCreated) {
    fs.writeFileSync(packagePath, originalPackage, 'utf8');
    fs.writeFileSync(lockPath, originalLock, 'utf8');
  }
  throw error;
}
