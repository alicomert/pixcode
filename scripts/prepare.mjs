import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const huskyBin = path.join(root, 'node_modules', 'husky', 'bin.js');

if (!fs.existsSync(huskyBin)) {
  // Published/runtime installs intentionally omit devDependencies.  There is
  // no repository to wire in that environment, so a missing Husky binary is
  // expected and must not make an otherwise valid production install fail.
  const npmOmit = String(process.env.npm_config_omit || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const productionInstall = process.env.npm_config_production === 'true'
    || npmOmit.includes('dev');
  if (productionInstall || !fs.existsSync(path.join(root, '.git'))) {
    process.stdout.write('Pixcode: skipping Husky setup for a packaged install.\n');
    process.exit(0);
  }

  throw new Error(`Husky is not installed at ${huskyBin}. Run npm install before preparing the repository.`);
}

const result = spawnSync(process.execPath, [huskyBin], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
