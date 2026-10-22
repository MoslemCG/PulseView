import {spawnSync} from 'node:child_process';
const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], {encoding: 'utf8'});
if (![0, 1].includes(current.status)) throw new Error('Cannot read Git hook configuration.');
if (current.stdout.trim() && current.stdout.trim() !== '.githooks') {
  throw new Error('A different core.hooksPath is configured; integrate the publication hooks without replacing existing hooks.');
}
const result = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {stdio: 'inherit'});
if (result.status !== 0) throw new Error('Cannot enable local publication hooks.');
console.log('Publication pre-commit and pre-push hooks enabled for this clone.');
