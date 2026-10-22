# File placement and publication policy

Read this before creating files or adding a generator/test/build command.
Classify by purpose, not by age: new product code and permanent tests belong in
Git. Disposable experiments and generated output do not.

| Purpose | Location | Git |
|---|---|---|
| Native implementation and build inputs | `native/`, `cmake/` | Yes |
| Frontend source, themes and owned runtime assets | `ui/` | Yes |
| Permanent automated tests and sanitized fixtures | `tests/` | Yes |
| Maintained developer/build/test tools | `scripts/` | Yes |
| Public documentation | `docs/` | Yes |
| Reviewed synthetic sample presets/themes | `examples/` | Yes |
| CI and shared development configuration | `.github/`, `.githooks/`, `.vscode/` | Yes, no personal settings |
| Builds, packages, downloads and generated caches | `out/build/`, `out/package/`, `out/deps/` | No |
| Test reports, browser captures and diagnostic output | `out/test-results/<suite>/` | No |
| One-off scripts, investigations and experiments | `out/scratch/<task>/` | No |
| Personal inputs, real presets, private reports and local references | `.local/<task>/` | No |
| App runtime state | `%LOCALAPPDATA%/PulseView/` | No |

## Rules for developers and agents

1. Put new permanent code in its owning source directory. Normal new files there
   are eligible for Git without editing ignore rules. New top-level directories
   are ignored until deliberately classified; prefer the existing owners.
2. Every new tool must default all output to `out/`. Tests belong in `tests/`,
   but their output does not. Do not save scratch work inside public source/docs.
3. Keep secrets outside the checkout where possible. If local inputs must be
   colocated, use `.local/`. Never disguise private data as a source fixture.
4. `docs/screenshots/` and the existing `docs/*test-results.json` hold deliberately
   reviewed publication evidence, not automatic test output. Browser tests now
   write to `out/test-results/`. Promote a selected capture/report to docs only
   after checking its content, privacy and simulated-data labeling.
5. `native/MetricDefinitions.h` is an intentional generated source exception:
   it is required for builds without Node and must stay synchronized. The source
   manifest is another intentional public generated artifact.
   `ui/core/version.js` is also committed: it derives from package.json for native
   builds without Node. Installer sources live under `scripts/installer/`; Setup,
   ZIPs, downloaded prerequisites and checksums stay under ignored `out/`.
   Other generated outputs stay under `out/` unless an explicit reviewed requirement says otherwise.
6. Never use `git add -f`, `--no-verify`, or disable hooks to solve a publication
   rejection. Move accidental output to its proper local directory. If a genuinely
   new public top-level component is needed, review its purpose and update the
   root ownership list once; do not add per-file exceptions for ordinary code.

## Automatic enforcement

`.gitignore` is the single path-policy source: known public roots accept new files,
while local/generated names are excluded at every depth. Install the tracked hooks
once per clone with `npm run setup:git` (Node 20+ and Git required). Installation
refuses to replace a different configured hooks directory.

- `pre-commit` checks every staged path, including force-added ignored files.
- `pre-push` checks every tree in the history being sent, so committing a local file
  and deleting it in a later commit does not hide it from the check. Unknown remote
  history is handled conservatively by checking all ancestors of the pushed ref.
- CI runs `npm run check:publication` on the checked-out index. CI is a second
  check **after upload**, not a substitute for the local pre-push hook.
- Run `npm run test:publication` to exercise the guard in disposable Git repos.

Hooks are enabled in this prepared checkout, but Git does not automatically enable
them in future clones. Hooks can be bypassed deliberately and ignore rules do not
remove already committed history. If a secret ever reaches a commit, stop, rotate
the credential and clean the affected history before publishing.

No path policy can infer that an arbitrary paragraph, image or fixture contains
private information. A normal source filename can still contain a secret. Review
content before committing; this system prevents common placement/output mistakes,
not all possible disclosure. A new public component may occasionally need a policy
change; routine source additions and local outputs do not.
