# PulseView — mandatory handoff for coding agents

Distribution update (22 October 2026): current version is 1.1.1, defined by
`package.json`. Run `node scripts/sync-version.mjs` after a version change;
`ui/core/version.js` is intentionally committed for builds without Node. CMake
generates the native version/header from the same value. Footer and About show it.
The footer has a labeled About/version button; every pane's context menu has a
versioned About action, also available in Charts-only mode. There is no Help menu.
The tag workflow builds an unsigned per-user Setup and portable ZIP, runs isolated
installer smoke tests, then publishes GitHub Release assets. Build/dependency and
hardware acceptance limits below remain in effect; historical source-only delivery
statements describe the original delivery, not the later binary distribution.

File ownership and publication: follow `docs/FILE_POLICY.md` for every new file
and tool. New permanent source/tests belong in Git; generated output and one-off
experiments belong under ignored `out/`, private inputs under `.local/`. Enable
the tracked publication hooks with `npm run setup:git` in each clone.

Mandatory release parity: the owner's normal executable is
`out/build/ninja-release/bin/PulseView.exe`. Every delivered release must use the
same published GitHub portable artifact at that path, not a separately compiled
local binary. After release CI passes, close the app normally, run
`scripts/sync-local-release.ps1`, reopen that executable and verify the footer and
About version in the actual Windows app. The script checks the published ZIP's
SHA256, backs up the old runtime, preserves AppData and compares every installed
distribution file byte-for-byte. `-VerifyOnly` checks an existing installation.
A later local build overwrites release parity: rerun the sync before handing the
app back to the owner. Do not claim delivery complete while parity is unverified.
Keep the public README brief; feature details and engineering instructions belong
in the linked guides, not long marketing or explanatory prose.

Public-source packaging note: the original `docs/design/reference.png` and
`chart-target.png` are retained locally but excluded from Git because public
redistribution permission is unestablished. In a public clone, read
`docs/design/README.md` and inspect `docs/screenshots/` instead. When the local
references exist, they remain the approved targets. Do not re-add them to Git.

Read this file, `README.md`, `docs/ARCHITECTURE.md`, `docs/PROTOCOL.md`, `docs/METRICS.md`, and `docs/TEST_REPORT.md` before editing. The approved visual reference is **`docs/design/reference.png`**. Open it as an image, then compare your actual rendered UI to it. Actual implementation captures are in `docs/screenshots/`. Do not replace visual checking with a claim that the CSS "looks right".

## Product contract: do not silently change these requirements

1. This is a **Windows 11 x64 performance-only desktop application**, C++20/Win32 + WebView2. It is not a website deployment, Electron shell, process/task manager or cloud service. Production has no network server, CDN, account or frontend package installation.
2. The workspace is a **recursive binary split tree**. Every leaf can independently split left/right (`axis: "x"`) or top/bottom (`axis: "y"`). Every internal node owns its local ratio. Never flatten it to a dashboard grid, fixed columns, CSS masonry or automatic responsive rearrangement.
3. A fresh workspace has exactly one cell. Assign any widget to any leaf; empty leaves are valid. Removing a leaf promotes its sibling. Exchanging widgets does not exchange their split geometry.
4. Resizing the app never hides/deletes/reparents panes. If the requested hierarchy cannot fit, use recursive minimum sizes and scrolling. Labels may become more compact; the assigned metrics and leaf identities must remain intact. There are currently 128-leaf and 32-depth safety limits, not unlimited physical screen space.
5. Focus is **transient view state**, not a destructive tree edit. One click on a chart/title/focus icon expands its pane into the workspace; a second click or Escape restores the same tree and ratios. Top controls remain accessible unless the independent `chromeHidden` (Charts only) presentation mode is enabled. No browser Fullscreen API is involved.
6. Presets are explicit, persistent **files on disk** in `%LOCALAPPDATA%\PulseView\presets`. Save layout tree, widget settings, theme, native DIP geometry/monitor and workspace settings. Automatic session drafts must not silently overwrite named presets. Do not replace native storage with browser localStorage.
7. Beauty and compactness are first-class requirements. Match the navy reference, thin panel boundaries, restrained radius, readable small type, magenta GPU, amber VRAM, lime CPU, electric-blue network and vertical gradient chart fills. No large decorative whitespace, rings or giant hero numbers. Do not restore the reference's Processes or general System Info cards: they are outside scope.
8. Native telemetry must be real or explicitly unavailable. Never substitute the browser simulator after a native collector error. Never equate GPU Compute, CUDA, NVML GPU busy, memory-controller busy and allocated VRAM. See the metric contract before changing labels or data sources.
9. Custom CSS themes are supported. Keep color definitions in tokens and let the Canvas layer resolve them. Do not embed theme-dependent colors only in JavaScript or require a rebuild for a user theme.
10. Click-through is opt-in and recoverable. Keep the tray recovery action, global **Ctrl+Alt+Shift+F11**, visible capability failures, and startup reset to interactive mode. Do not use F12 (Windows reserves it for debugging). Never turn on click-through without explicit permission and functioning recovery facilities.

## Delivery state: facts, not aspirations

The source includes the native host, collectors, persistence, bridge, frontend, build scripts, source tests and Windows CI workflow. The actual frontend was rendered and interaction-tested in Linux Chromium with explicit demo telemetry. Portable C++ telemetry-math tests were compiled and passed on Linux. **The Windows executable has not been built or run in the delivery environment.** Native storage/API/COM behavior, real WDDM counters, multi-monitor DPI, composition opacity and cross-application click-through require Windows acceptance testing. Do not claim those tests passed just because source or CI YAML exists.

There is no prebuilt `.exe` in the source ZIP. There is no promise that a first Windows compile cannot reveal an integration issue. Fix such issues in the implementation without weakening the product contract or replacing real telemetry with sample values. Record actual results in `docs/TEST_REPORT.md` and `docs/WINDOWS_ACCEPTANCE.md`.

22 October 2026 follow-up: an existing Windows executable was observed running;
its packaged UI matched the current UI source. Limited GPU/split UI interaction
was captured, then the original session restored. README media instead uses a
fresh browser Demo with labeled synthetic samples (see `docs/MEDIA.md`). Complete
native acceptance is still pending; the delivery statements above describe the
original environment, not a claim that no executable has ever run on this machine.

## Fastest orientation

- `native/main.cpp`: STA startup, single-instance guard and `--safe-mode`.
- `native/Application.*`: Win32 lifetime, custom chrome/resize, geometry, tray/hotkeys, RPC dispatcher, telemetry event coalescing.
- `native/WebViewHost.*`: WebView2 composition controller, local origin, security, input forwarding, DirectComposition opacity. Posted deferred work keeps modal UI outside WebView2 callbacks.
- `native/Telemetry.cpp`: worker collector orchestrator, device discovery, PDH CPU/GPU/disk, Win32 memory, IP Helper network, NVML integration.
- `native/PdhQuery.*`, `Nvml.*`, `TelemetryMath.h`: provider wrappers and independently testable math.
- `native/Storage.*`, `WinUtil.*`: constrained paths, JSON validation, atomic writes/backups, themes, session and log.
- `native/MetricDefinitions.h`: **generated** from `ui/core/catalog.js`; regenerate with `node scripts/sync-metrics.mjs`.
- `ui/core/layout.js`: pure immutable tree operations, validators, recursive minima, undo history.
- `ui/app.js`: state orchestration, recursive DOM renderer, splitter/drag interactions, modals and session/preset flows.
- `ui/core/catalog.js`: metric descriptors and per-widget defaults/sanitization.
- `ui/core/widgets.js`, `charts.js`: display types, unit-aware chart scales, Canvas drawing and mini-charts.
- `ui/core/history.js`: bounded timestamped history with genuine null gaps.
- `ui/core/bridge.js`: native RPC; a distinct browser-only adapter.
- `ui/core/demo.js`: **only** browser simulator; never used by C++.
- `ui/app.css`, `ui/themes/*.css`: styling/tokens. `ui/index.html` has production CSP.

## Build and run — Windows

Requirements: Windows 11 x64; Visual Studio/Build Tools 2022, Desktop development with C++, MSVC v143, Windows SDK 10.0.22621+, CMake 3.24+, WebView2 Evergreen x64 Runtime. Node is not needed for the production build.

```powershell
cmake --preset windows-x64
cmake --build --preset release --parallel
ctest --preset windows-release
.\out\build\windows-x64\bin\Release\PulseView.exe
# Safe UI recovery, after closing the running instance:
.\out\build\windows-x64\bin\Release\PulseView.exe --safe-mode
```

Or `scripts/build.ps1 -Configuration Release -Run`. `scripts/package.ps1` stages executable + `ui` after a successful build. Keep `ui` beside the executable. SDK/json downloads are pinned in `cmake/Dependencies.cmake`; offline paths are documented in README. The source archive does not include those dependencies. Never disable TLS checking to make a failing download appear successful.

## Edit/test loop

1. Make the smallest change at the responsible layer. Preserve the split-tree and storage schemas.
2. Run `npm run check` and `npm test`. If base metric metadata changed, regenerate `native/MetricDefinitions.h` and check the diff.
3. Run portable C++ tests:
   ```sh
   cmake --preset portable-tests
   cmake --build --preset portable-tests
   ctest --preset portable-tests
   ```
4. For visual iteration: `python scripts/preview.py`. This intentionally uses simulated data and localStorage. It does not validate actual Windows telemetry or controls.
5. Optional reproducible screenshots/interactions:
   ```sh
   npm install --no-save typescript
   python -m pip install playwright
   python -m playwright install chromium
   python tests/browser_test.py
   ```
   Set `PULSEVIEW_CHROMIUM` to a Chromium executable if needed. The offline trusted-asset test harness removes CSP and substitutes memory storage; do not present it as a native or security test. Production loads original ES modules, not the test bundle.
6. Open `docs/screenshots/overview.png`, `gpu-work.png` and `vram-only.png`. Compare with `docs/design/reference.png`, including colors, chart fill, padding, truncation and contrast. Test small windows as well as a full overview.
7. Native changes require an actual MSVC build and Windows acceptance. Run non-admin, with network disconnected after prerequisites, and on at least one NVIDIA machine plus a non-NVIDIA/missing-provider case where practical. Log unsupported hardware instead of inventing support.

## Extension recipes

### Add a scalar metric

Define truthful name/unit/source/support in `catalog.js`; choose a stable ID and group. Add the native provider reading and descriptor, including dynamic device identity if appropriate. Use raw base units (bytes, bytes/second, percent, MHz, Celsius, watts, milliseconds), `null` for missing/priming, and observed timestamps. Update subscriptions, demo-only fixture, tests and `METRICS.md`. Regenerate the header. Do not calculate system-wide VRAM from `IDXGIAdapter3::QueryVideoMemoryInfo`, which is process-scoped.

### Add a widget

Extend defaults/sanitization, `WidgetView`, subscription dependencies, settings UI and unit tests. A widget belongs to one leaf; it must not mutate the tree to accommodate its contents. Dispose observers/event handlers when the view is destroyed. Compound widgets must keep every requested data element reachable at small sizes.

### Add a theme

Start with `examples/custom-ember.css`; change CSS variables. Do not change IDs or hide UI elements via a theme. The app supports trusted full CSS but arbitrary malicious CSS can impair usability; safe mode is the recovery path. Third-party CSS must not fetch scripts, fonts or remote resources.

### Change preset schema

Current `schemaVersion` is 1. Both JS and C++ validators are involved. Add an explicit migration for a new version rather than overwriting old JSON. Preserve unknown device IDs when hardware is unavailable. Never rewrite built-in IDs as saved user presets. Test corrupted JSON, duplicate IDs, deep/large trees, missing monitor, and named-preset versus draft behavior.

## Non-obvious implementation rules

- WebView2 objects live on the UI STA thread. Workers never call WebView2. The worker posts/coalesces immutable packets to the window; UI publishes JSON events.
- Native `WebMessageReceived` and script-dialog handlers **post deferred actions**. Do not show modal native UI or start nested message loops directly in those callbacks.
- PDH percentage/rate counters need two valid samples. Baseline after pause/resume and provider activation. Initial/unavailable samples are gaps, not zero.
- CPU logical IDs include processor group and logical index. Do not assume at most 64 logical processors or confuse logical processors with physical cores.
- GPU totals use busiest-engine aggregation, not an average or sum of arbitrary engines. Avoid double-counting process-level engine instances.
- Frame rendering cadence is independent of sampling. Do not poll the machine at animation-frame speed to make charts smooth. Keep bounded histories and redraw only when needed.
- Window geometry is monitor-relative DIPs. A changed/disconnected monitor intentionally causes safe clamping, not an invisible off-screen restore.
- Default alias metrics follow a selected default adapter; explicit discovered device IDs pin a device. Missing device metrics stay unavailable. Do not silently bind a saved device to another GPU/NIC.
- Never introduce a general `eval`, shell command, filesystem path or arbitrary native object RPC. New RPC needs a narrow schema, validation and documentation.
- Error messages must reach the UI/log; do not swallow failures into plausible-looking sample data.
- Preserve explicit demo labelling even when sampling is paused. No screenshot should imply synthetic readings are real.

## Scope not implemented

CPU/motherboard temperatures requiring another driver, process lists, task termination, GPU tuning, isolated Tensor/RT/SM activity, recordings to disk, cloud sync, remote monitoring, automatic app updates, signed installer, ARM64 and cross-platform native hosts are not part of this delivery. NVML sensor support varies by hardware and driver. Native hardware overhead is not benchmarked. The README and test report are the authority on tested status.

## Version 1.1.0 requirements — do not regress

The latest request is code-level chart fidelity, **middle-click charts-only mode**, real X/Y hover values, and several CSS skins. Do not substitute generated pictures for implementation. Read `CHANGELOG.md`, `docs/THEMES.md` and the current `docs/TEST_REPORT.md` before changing this revision. Both visual references are in `docs/design/`; neither is an application screenshot. Actual screenshots are in `docs/screenshots/`.

- `settings.compact` controls density. **`settings.chromeHidden` is a separate saved boolean**, default false for old schema-v1 presets. Do not rename or conflate them. JS and C++ validation must agree.
- Middle-button default autoscroll/paste is prevented on pointer/mouse down; toggle exactly once on `auxclick` with `button === 1`. Left click keeps pane focus. Wheel scrolling and right-click menus remain independent.
- `setChromeHidden` changes CSS/available workspace only; it must not call `render`, recreate canvases, reset history, alter the split tree, or apply outer window geometry. Use the narrow **`window.chrome`** RPC to preserve the presentation flag on the native side, not a broad sampler/window reconfiguration. Named and draft saves capture that flag. An RPC failure is reported and the optimistic flag reverts if still current.
- Hide titlebar, toolbar, focus strip and footer together. Keep pane titles and the modular tree. Ctrl+Shift+C and the context menu are alternative controls. Escape first closes modal UI, next restores chrome, next restores focused layout. Alt+left-drag in native charts-only mode moves the window. Native global/tray recovery restores chrome and mouse input.
- `ui/core/chart-model.js` contains pure parsing/color/gradient/nearest-sample helpers. `charts.js` is the actual renderer/DOM inspector; `widgets.js` carries metric color family and raw values through normalization. Do not add a chart framework just for this feature.
- Chart gradients start at the **visible crest**, not the axis maximum. Per-family top/mid/bottom tokens prevent all fills becoming the same purple. Draw all series fills before their sharp strokes. Keep the highlight narrow and glow restrained; do not smooth or fabricate metric peaks. Saved explicit color/opacity overrides survive theme changes. The reset button changes only appearance.
- Hover reports actual sample timestamps and units, bounded within the pane. Mini-core plots share this renderer. Missing values and sparse gaps remain unavailable. Keep normalized raw values and label the mouse's unsnapped vertical coordinate separately. Tooltips use DOM text, not raw user HTML.
- Keep local split flex weights **`ratio * 100` and `(1-ratio) * 100` fr**. Using sub-unit fractions (e.g. 0.6fr/0.4fr) can leave unused space after a sibling hits a minimum. Stored ratios remain [0.02,0.98]. Every split must fill its available extent while respecting minima.
- Skin registry: `ui/core/themes.js`; CSS files: `ui/themes/`; links: `ui/index.html`. Seven are bundled. Custom CSS is appended afterward; renderer tokens need concrete hex/rgb values. If changing a family, define its fill tokens too rather than inheriting a differently colored ramp.

Run `npm run check`, `npm test`, **both** `python tests/browser_test.py` and `python tests/revision_browser_test.py`, plus portable CMake/CTest. The revision browser suite also checks real Canvas pixel ramps, no chart recreation on middle-click, cold preview persistence, tooltip gaps, seven skins and empty-track regression. Windows storage tests now cover the independent flag and a JSON disk roundtrip, but must actually be run on Windows before claiming that native path passed. No Windows executable is included in this delivery.

Do not capture release screenshots from a test page after injecting sparse or nonchronological fixtures. Boot a fresh preview or clear the store before seeding. Do not distribute temporary fixtures, browser caches, build trees or any font files. Regenerate `SOURCE_MANIFEST.json` after all source/docs/screenshots are final.
