import {readFileSync, writeFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const {version} = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a numeric major.minor.patch version.');
const target = new URL('ui/core/version.js', root);
const content = `// Generated from package.json by scripts/sync-version.mjs.\nexport const APP_VERSION = '${version}';\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== content) throw new Error('Run node scripts/sync-version.mjs and commit the generated version.');
} else writeFileSync(target, content);
