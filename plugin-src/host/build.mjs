import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceDirectory, '../..');
const outputPath = resolve(packageRoot, 'lib/index.js');

await mkdir(dirname(outputPath), { recursive: true });
await build({
  entryPoints: [resolve(sourceDirectory, 'index.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  packages: 'external',
  outfile: outputPath,
  sourcemap: false,
  legalComments: 'none',
});

console.log(`Wrote ${outputPath}`);
