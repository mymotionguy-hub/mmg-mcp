// Make a zip to hand to the team: release/mmg-mcp-<version>.zip
// Contains everything committed in git (panel, host, server source, installers, docs).
// Teammates unzip it and run install.ps1 (Windows) or install.sh (Mac).
// Run from the repo:  node scripts/package.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const { version } = JSON.parse(readFileSync(join(root, 'server', 'package.json'), 'utf8'));
if (git('status', '--porcelain').trim()) {
  console.warn('Warning: you have uncommitted changes. The zip only contains what is committed.');
}
mkdirSync(join(root, 'release'), { recursive: true });
const out = join('release', `mmg-mcp-${version}.zip`);
git('archive', '--format=zip', '--prefix=mmg-mcp/', '-o', out, 'HEAD');
console.log(`Made ${out}. Send it to the team with docs/TEAM-GUIDE.md.`);
