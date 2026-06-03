import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'sr-engine-smoke-'));

  try {
    const { stdout: packOutput } = await execFileAsync('npm', ['pack', '--silent'], {
      cwd: rootDir,
    });
    const packFileName = packOutput.trim().split('\n').at(-1);
    if (!packFileName) {
      throw new Error('npm pack did not return a tarball name');
    }

    const sourceTarball = join(rootDir, packFileName);
    const tarballPath = join(tempRoot, packFileName);
    await rename(sourceTarball, tarballPath);

    const consumerDir = join(tempRoot, 'consumer');
    await execFileAsync('mkdir', ['-p', consumerDir]);
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify({
        name: 'sr-engine-smoke-consumer',
        private: true,
        type: 'module',
      }, null, 2),
    );

    await execFileAsync('npm', ['install', tarballPath], {
      cwd: consumerDir,
      env: process.env,
    });

    const smokeSource = `
      import {
        SupportResistanceEngine,
        StrictSupportResistanceEngine,
        PermissiveSupportResistanceEngine,
        createSupportResistanceRollingEngine,
        toChartOverlays,
        toScannerFacts
      } from 'sr-engine';
      import { resolveSupportResistanceConfig } from 'sr-engine/config';
      import 'sr-engine/types';
      import { createSupportResistanceRollingEngine as rollingSubpath } from 'sr-engine/rolling';
      import { toChartOverlays as chartSubpath } from 'sr-engine/chart';
      import { toScannerFacts as factsSubpath } from 'sr-engine/facts';

      if (SupportResistanceEngine !== StrictSupportResistanceEngine) {
        throw new Error('Strict alias mismatch');
      }
      if (
        !PermissiveSupportResistanceEngine ||
        !createSupportResistanceRollingEngine ||
        !rollingSubpath ||
        !toChartOverlays ||
        !chartSubpath ||
        !toScannerFacts ||
        !factsSubpath ||
        !resolveSupportResistanceConfig
      ) {
        throw new Error('Missing expected public export');
      }
    `;

    await execFileAsync('node', ['--input-type=module', '--eval', smokeSource], {
      cwd: consumerDir,
      env: process.env,
    });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
