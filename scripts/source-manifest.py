#!/usr/bin/env python3
"""Regenerate public-source hashes from the reviewed Git index.

Stage reviewed source/docs/screenshots first, run this, then stage the manifest.
Does not stage, commit or push. Hashes describe staged blobs, including Git's
line-ending normalization, and therefore match a git archive of that index.
"""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    subprocess.run(['node', 'scripts/check-publication.mjs'], cwd=ROOT, check=True)
    raw = subprocess.check_output(
        ['git', 'ls-files', '--cached', '-z'],
        cwd=ROOT,
    )
    names = sorted(set(filter(None, raw.decode('utf-8').split('\0'))))
    if not names:
        raise SystemExit('Stage the reviewed public-source files first.')
    # --exclude-standard does not hide already tracked files; reject those too.
    ignored = subprocess.run(
        ['git', 'check-ignore', '--no-index', '--stdin', '-z'],
        input='\0'.join(names).encode('utf-8') + b'\0', cwd=ROOT,
        stdout=subprocess.PIPE, check=False,
    )
    if ignored.returncode not in (0, 1):
        raise SystemExit('Could not validate Git exclusions.')
    if ignored.stdout:
        raise SystemExit('Ignored files are tracked; remove them from the index before publishing.')
    manifest_path = ROOT / 'SOURCE_MANIFEST.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entries = []
    for name in names:
        if name == 'SOURCE_MANIFEST.json':
            continue
        path = ROOT / name
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(ROOT):
            raise SystemExit(f'Unexpected non-regular source file: {name}')
        data = subprocess.check_output(['git', 'show', ':' + name], cwd=ROOT)
        entries.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    manifest['manifestScope'] = (
        'Reviewed staged Git files, excluding this manifest itself. '
        'Local references, credentials, runtime state, build output, dependencies '
        'and caches excluded. Hashes describe staged Git blob bytes.'
    )
    manifest['files'] = entries
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Updated manifest: {len(entries)} public-source files.')


if __name__ == '__main__':
    main()
