// Build the macOS .icns app icon from assets/logo/mark.svg.
//
// Steps:
//   1. Rasterize mark.svg at all the sizes Apple's iconset format wants.
//   2. Drop the PNGs into a temporary .iconset directory with Apple's
//      exact filenames (icon_16x16.png, icon_16x16@2x.png, etc.).
//   3. Invoke `iconutil` (macOS built-in) to package the iconset into
//      icon.icns at assets/logo/icon.icns.
//
// Run via: npm run build:icon
// The generated .icns is referenced by forge.config.ts as the app icon.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Resvg } from '@resvg/resvg-js';

const exec = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const srcSvg = join(root, 'assets/logo/mark.svg');
const iconsetDir = join(root, 'assets/logo/icon.iconset');
const outIcns = join(root, 'assets/logo/icon.icns');

// macOS iconset spec: (logical size, @2x flag). @2x means double pixel size.
// Apple wants 10 entries in total; iconutil assembles them into one .icns.
const variants = [
  { size: 16, scale: 1 },
  { size: 16, scale: 2 },
  { size: 32, scale: 1 },
  { size: 32, scale: 2 },
  { size: 128, scale: 1 },
  { size: 128, scale: 2 },
  { size: 256, scale: 1 },
  { size: 256, scale: 2 },
  { size: 512, scale: 1 },
  { size: 512, scale: 2 },
];

async function main() {
  const svg = await readFile(srcSvg);

  // Fresh iconset directory every run — iconutil is picky about extras.
  await rm(iconsetDir, { recursive: true, force: true });
  await mkdir(iconsetDir, { recursive: true });

  for (const { size, scale } of variants) {
    const pixelSize = size * scale;
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: pixelSize },
    });
    const png = resvg.render().asPng();
    const suffix = scale === 2 ? '@2x' : '';
    const filename = `icon_${size}x${size}${suffix}.png`;
    await writeFile(join(iconsetDir, filename), png);
    console.log(`  ${filename}  (${pixelSize}×${pixelSize})`);
  }

  await exec('iconutil', ['-c', 'icns', iconsetDir, '-o', outIcns]);
  console.log(`\nWrote ${outIcns}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
