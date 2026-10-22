// Uses the current checkout's .gitignore rules, including for historical trees.
// Checks placement, not semantic privacy or arbitrary credential formats.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

function git(args, input) {
  const r = spawnSync('git', args, {input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024});
  if (r.status !== 0) throw new Error(`Git check failed: ${args[0]}`);
  return r.stdout;
}
function ignored(names) {
  if (!names.length) return [];
  const r = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
    input: names.join('\0') + '\0', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  if (![0, 1].includes(r.status)) throw new Error('Cannot evaluate publication exclusions.');
  return r.stdout.split('\0').filter(Boolean);
}
function checkRows(rows) {
  const names = [];
  for (const row of rows.split('\0').filter(Boolean)) {
    const split = row.indexOf('\t');
    const meta = row.slice(0, split).split(' ');
    const name = row.slice(split + 1);
    if (split < 0 || !['100644', '100755'].includes(meta[0])) {
      throw new Error(`Non-regular file or submodule requires explicit review: ${name}`);
    }
    names.push(name);
  }
  const denied = ignored([...new Set(names)]);
  if (denied.length) throw new Error(`Local/generated or unclassified files cannot be published:\n${denied.join('\n')}`);
}
try {
  if (process.argv.includes('--push')) {
    const commits = new Set();
    for (const line of readFileSync(0, 'utf8').trim().split('\n').filter(Boolean)) {
      const fields = line.trim().split(/\s+/);
      if (fields.length !== 4) throw new Error('Invalid pre-push ref input.');
      const [, local, , remote] = fields;
      if (!/^[a-f0-9]{40,64}$/.test(local) || !/^[a-f0-9]{40,64}$/.test(remote)) throw new Error('Invalid push object ID.');
      if (/^0+$/.test(local)) continue; // ref deletion sends no source
      const known = !/^0+$/.test(remote) && spawnSync('git', ['cat-file', '-e', `${remote}^{commit}`]).status === 0;
      // ^{commit} also peels annotated tags; non-commit refs fail closed.
      const range = known ? `${remote}..${local}^{commit}` : `${local}^{commit}`;
      for (const commit of git(['rev-list', range]).trim().split('\n').filter(Boolean)) commits.add(commit);
    }
    for (const commit of commits) checkRows(git(['ls-tree', '-r', '-z', '--full-tree', commit]));
    console.log(`Publication policy passed for ${commits.size} outgoing commits.`);
  } else {
    if (git(['ls-files', '--unmerged', '-z'])) throw new Error('Resolve index conflicts first.');
    checkRows(git(['ls-files', '--stage', '-z']));
    console.log('Publication policy passed for the staged file set.');
  }
} catch (error) {
  console.error(`Publication blocked: ${error.message}\nSee docs/FILE_POLICY.md. Do not bypass the hooks.`);
  process.exitCode = 1;
}
