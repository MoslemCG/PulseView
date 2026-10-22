# Agent entry point

Read and follow **[docs/FILE_POLICY.md](docs/FILE_POLICY.md)** before creating
files. Permanent source/tests/docs go in their owning directories; all disposable
work and generated output go under `out/`, private inputs under `.local/`.
New required source files should be tracked normally. Never bypass publication
hooks or force-add ignored output. Run `npm run setup:git` in each new clone.

Public clones intentionally omit the locally retained design-reference PNGs.
If `docs/design/reference.png` is absent, read `docs/design/README.md` and use
the actual screenshots in `docs/screenshots/` for visual context. Do not add
the original PNGs to Git without establishing redistribution permission.

Read **[agent.md](agent.md)** in full before modifying this repository. It contains the product invariants, design reference, file map, build/test commands, metric semantics, security rules and the precise tested/untested delivery state.

Also read `README.md` and the relevant documents in `docs/`. `docs/design/reference.png` is the approved visual target. Do not replace the recursive split tree with a regular grid or native telemetry with simulated values.

Version 1.1.0 also requires the final section of `agent.md` (Charts only, gradient renderer, real-sample hover and seven skins). Do not omit `tests/revision_browser_test.py` from regression testing. Native Windows tests are pending, not passed by implication.
