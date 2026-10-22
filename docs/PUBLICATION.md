# Public source preparation — 22 October 2026

The initial privacy-preparation stage created a local `main` branch and reviewed
index without a remote, commit or push. The owner subsequently authorized public
GitHub publication with an English feature guide and feature-specific media.
The publication snapshot includes that README and reviewed synthetic Demo captures.
Publication uses the account's GitHub no-reply commit identity rather than a
personal email address.

## Review outcome

- Authored source, tests, examples, documentation and hidden project configuration
  were checked for common credential formats, private keys, personal email
  addresses, local developer paths and copied runtime data. No such private value
  was identified in the selected public files. Fixture identifiers, generic
  hardware labels, loopback addresses and example dependency paths are not secrets.
- Public screenshot pixels were inspected and PNG metadata checked. Screenshots
  show simulated application data; no personal information was observed.
- Build caches contain workstation paths and the Windows shortcut contains a
  local target. Both remain local and excluded, along with downloaded dependencies,
  logs, debug symbols, runtime state and credential-file patterns.
- The original design-reference PNGs remain local and excluded because their
  redistribution rights are unestablished. The public design README explains the
  actual screenshot alternatives. Existing source MIT licensing is preserved.
- No Git repository/history existed at the start. There were therefore no old
  commits, branches or tags to scrub. The prepared index is the publication set.
- Selected native bridge/storage/CI boundaries were also reviewed; no material
  exploitable vulnerability was established. This is not an exhaustive runtime
  security audit, dependency-advisory audit or guarantee against unknown secrets.

## Validation performed for preparation

| Check | Current result |
|---|---|
| `npm run check` | Passed |
| `npm test` | 71 passed, including 4 publication-policy integration tests |
| `python tests/browser_test.py` | 26 interaction checks passed |
| `python tests/revision_browser_test.py` | 75 interaction checks passed |
| Portable CMake configure/build + CTest | 1 test passed, MSVC 19.42 / Ninja |
| Native Windows app/hardware acceptance | Not run for this preparation; pending |

Browser tests and portable compilation ran from an ignored isolated source copy
so test screenshots did not overwrite the existing published captures. Browser
tests used Playwright 1.64.1 and an existing Chromium installation. Initial attempts
needed the local Playwright package and Visual Studio developer environment; final
runs passed. The portable build emitted warning C4530 about exception unwind flags;
its test passed. Application code and its existing behavior were not changed.

The file-policy follow-up also ran both browser suites directly from the checkout:
all 26 + 75 checks passed, with outputs confined to `out/test-results/` and no
changes to published screenshots/results. Portable CTest passed again. Local
commit/push guards passed their four positive/negative integration tests.

## Publishing the reviewed files later

Ongoing file ownership and local commit/push guards are defined in
`FILE_POLICY.md`. Hooks are enabled in the prepared checkout; future clones must
run `npm run setup:git`. Use `npm run check:publication` before generating an
archive. Tests write new evidence to ignored `out/test-results/`, not public docs.

1. Inspect `git diff --cached --stat` and `git diff --cached`. Do not force-add
   ignored files or upload a ZIP of the entire working directory.
2. Review any subsequent new files before staging. Rebuild the source manifest
   after staging the intended source with `python scripts/source-manifest.py`,
   then stage `SOURCE_MANIFEST.json`. Its hashes describe staged blob bytes,
   including Git line-ending normalization.
3. Before the first commit, select the intended public author identity. Use your
   GitHub-provided no-reply email if you do not want a personal email in commit
   metadata. Preparation did not change global Git identity.
4. When publication is authorized, create the public repository and configure
   its remote. Enable secret scanning/push protection and private vulnerability
   reporting where available. No GitHub settings have been changed locally.
5. Native CI and `WINDOWS_ACCEPTANCE.md` still need actual results before claiming
   a validated Windows application release.

The source ZIP under ignored `out/publication-review/` is produced from the
reviewed Git tree, with no `.git` directory, local references or ignored data.
This document contains no workstation-specific absolute paths or private contacts.
