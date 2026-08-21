import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const installerDirectory = path.resolve('out', 'make', 'squirrel.windows', 'x64');
const installer = (await readdir(installerDirectory)).find((name) => name.endsWith(' Setup.exe'));

if (!installer) throw new Error('O instalador Squirrel não foi encontrado para gerar o checksum.');

const hash = createHash('sha256').update(await readFile(path.join(installerDirectory, installer))).digest('hex');
await writeFile(path.join(installerDirectory, `${installer}.sha256`), `${hash} *${installer}\n`, 'utf8');
