import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const installerDirectory = path.resolve('out', 'make', 'squirrel.windows', 'x64');
const releaseFiles = (await readdir(installerDirectory))
  .filter((name) => name === 'RELEASES' || name.endsWith('.exe') || name.endsWith('.nupkg'))
  .sort();
const installer = releaseFiles.find((name) => name.endsWith('.exe'));

if (!installer) throw new Error('O instalador Squirrel não foi encontrado para gerar o checksum.');

const hashFile = (filePath) => new Promise((resolve, reject) => {
  const hash = createHash('sha256');
  createReadStream(filePath)
    .on('data', (chunk) => hash.update(chunk))
    .on('error', reject)
    .on('end', () => resolve(hash.digest('hex')));
});

const checksums = [];
for (const releaseFile of releaseFiles) {
  const hash = await hashFile(path.join(installerDirectory, releaseFile));
  checksums.push(`${hash} *${releaseFile}`);
}

const installerChecksum = checksums.find((line) => line.endsWith(`*${installer}`));
await Promise.all([
  writeFile(path.join(installerDirectory, `${installer}.sha256`), `${installerChecksum}\n`, 'utf8'),
  writeFile(path.join(installerDirectory, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`, 'utf8'),
]);
