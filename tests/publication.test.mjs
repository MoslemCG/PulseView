import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'out/test-results/publication');
mkdirSync(artifacts, {recursive: true});
function run(cwd, command, args, input) {
  return spawnSync(command, args, {cwd, input, encoding: 'utf8'});
}
function git(cwd, ...args) {
  const result = run(cwd, 'git', args);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function put(cwd, path, content = 'synthetic test fixture\n') {
  mkdirSync(dirname(join(cwd, path)), {recursive: true});
  writeFileSync(join(cwd, path), content);
}
function fixture() {
  const cwd = mkdtempSync(join(artifacts, 'repo-'));
  git(cwd, 'init', '-b', 'main');
  git(cwd, 'config', 'user.name', 'Publication Test');
  git(cwd, 'config', 'user.email', 'test@example.invalid');
  for (const path of ['.gitignore', 'scripts/check-publication.mjs', '.githooks/pre-commit', '.githooks/pre-push']) {
    put(cwd, path, readFileSync(join(root, path)));
  }
  git(cwd, 'add', '.');
  return cwd;
}
const check = cwd => run(cwd, process.execPath, ['scripts/check-publication.mjs']);

test('new permanent source/tests/docs are accepted; disposable output is ignored at any depth', () => {
  const cwd = fixture();
  const publicFiles = ['native/new/module.cpp', 'ui/new/feature.js', 'tests/fixtures/synthetic.json', 'tests/new_case.py', 'docs/new-feature.md', 'scripts/new-tool.ps1'];
  const privateFiles = ['out/new-task/result.json', '.local/private.txt', 'unknown-folder/file.txt', 'native/out/result.json', 'tests/scratch/experiment.py', 'ui/.env.production', 'docs/session.json', 'tests/run.log', 'ui/node_modules/file.js'];
  for (const path of [...publicFiles, ...privateFiles]) put(cwd, path);
  git(cwd, 'add', '.');
  const tracked = git(cwd, 'ls-files').split('\n');
  for (const path of publicFiles) assert.ok(tracked.includes(path), path);
  for (const path of privateFiles) assert.ok(!tracked.includes(path), path);
  assert.equal(check(cwd).status, 0);
});

test('actual pre-commit hook blocks a force-staged generated file', () => {
  const cwd = fixture();
  git(cwd, 'config', 'core.hooksPath', '.githooks');
  put(cwd, 'out/private.json');
  git(cwd, 'add', '-f', 'out/private.json'); // deliberate negative fixture only
  const result = run(cwd, 'git', ['commit', '-m', 'must be blocked']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Publication blocked/);
  assert.notEqual(run(cwd, 'git', ['rev-parse', '--verify', 'HEAD']).status, 0);
});

test('pre-push checks earlier commits even when the final tree removed the private file', () => {
  const cwd = fixture();
  git(cwd, 'commit', '-m', 'clean baseline'); // hooks intentionally not installed in fixture yet
  const base = git(cwd, 'rev-parse', 'HEAD');
  put(cwd, 'out/private.json');
  git(cwd, 'add', '-f', 'out/private.json');
  git(cwd, 'commit', '-m', 'synthetic forbidden historical file');
  git(cwd, 'rm', 'out/private.json');
  git(cwd, 'commit', '-m', 'remove historical file');
  const head = git(cwd, 'rev-parse', 'HEAD');
  assert.equal(check(cwd).status, 0);
  for (const remote of [base, '0'.repeat(40)]) {
    const result = run(cwd, process.execPath, ['scripts/check-publication.mjs', '--push'], `refs/heads/main ${head} refs/heads/main ${remote}\n`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /out\/private.json/);
  }
});

test('clean new source commit passes pre-commit and outgoing-history checks', () => {
  const cwd = fixture();
  git(cwd, 'config', 'core.hooksPath', '.githooks');
  put(cwd, 'native/new.cpp', '// new permanent source\n');
  git(cwd, 'add', 'native/new.cpp');
  git(cwd, 'commit', '-m', 'legitimate source addition');
  const head = git(cwd, 'rev-parse', 'HEAD');
  const result = run(cwd, process.execPath, ['scripts/check-publication.mjs', '--push'], `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n`);
  assert.equal(result.status, 0, result.stderr);
});
