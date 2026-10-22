# Test report — PulseView 1.1.0 source delivery, 26 September 2026

## Version 1.1.1 regression — 22 October 2026

Local MSVC Release compilation passed, with both native CTest cases and the
portable CTest case passing. Syntax checks and all 71 Node tests passed. Browser
regressions passed 26 baseline and 81 revision checks, including readable About,
version visibility at 390px width and opening About through a Charts-only pane
menu. These browser assertions do not certify native UI or hardware behavior.

The owner previously ran `out/build/ninja-release/bin/PulseView.exe`, an older
deployment without the version UI. Release delivery now requires synchronizing
that path from the published portable artifact with checksum and per-file hash
verification; see `scripts/sync-local-release.ps1` and the handoff rules.

## Version display and binary distribution — 22 October 2026

The native Release executable was freshly compiled locally with MSVC 19.42 from
the shared package.json version. Both native CTest cases (telemetry math and
storage validation) passed; portable CTest also passed. JavaScript checks and all
71 Node tests passed. Baseline browser suite passed 26 checks; revision suite
passed 77 checks, including footer and About version visibility. About was
captured and visually checked from the actual preview frontend. Packaging verified
the executable ProductVersion and staged app-local C++ runtime files.

GitHub run [39831019559](https://github.com/MoslemCG/PulseView/actions/runs/39831019559)
passed the native build/tests, Setup compilation and the isolated Server 2025
installer smoke: install, executable version 1.1.0, uninstall and preservation of
the synthetic user-data marker. That smoke does not launch the app or validate
hardware. Microsoft bootstrapper signature verification also passed before it was
bundled; the missing-runtime installation branch is not claimed tested when the
runner already has WebView2.

The previous GitHub run 39824960646 independently passed its Windows build,
71 Node tests, both native tests and package upload. New Setup installation and
uninstallation are gated by the isolated Windows Server 2025 CI smoke; see its
actual run result before claiming that gate passed. Real GPU accuracy, DPI and
overlay acceptance remain pending.

## Public-source preparation rerun — 22 October 2026

README publication follow-up: the real frontend was served over loopback with its
original ES modules and CSP, then captured with complete chronological synthetic
showcase samples. Sixteen reviewed PNG/GIF assets were selected for README, each
with visible Demo disclosure. The capture run reported no browser JavaScript
errors. Syntax, all 71 Node tests, both browser suites (26 + 75) and portable
CMake/CTest (1 test) passed again. See `MEDIA.md` for provenance.

The existing native Windows executable was observed running and its packaged UI
files were byte-compared with the current source UI (no differences). Limited
GPU/pane-split interaction and capture were performed; the user's original session
was restored afterward. This is limited native UI evidence, not completion of
native storage, hardware accuracy, DPI, opacity or click-through acceptance. The
older sections below retain the original source-delivery history.

Follow-up file-policy validation on the same date passed 71 Node tests (including
four publication-guard integration tests), 26 baseline browser checks, 75 revision
browser checks and portable CMake/CTest (1 test). The guard fixtures verified new
permanent source acceptance, ignored nested output, actual pre-commit rejection,
and rejection of forbidden files in outgoing history even after later deletion.
These fixtures use disposable local repos under `out/test-results/publication`;
no remote push occurs. Browser reports/captures now default to
`out/test-results/browser` and `out/test-results/revision-browser`; the public
screenshots and historical JSON files were confirmed unchanged. Hooks are enabled
in this checkout; a new clone requires `npm run setup:git`.

The current source passed JavaScript syntax checks, 67 JavaScript unit tests,
26 baseline browser checks and 75 revision browser checks. Portable C++ configure,
build and CTest passed (1 test) with MSVC 19.42 and Ninja on Windows. The portable
build emitted C4530 about exception unwind semantics. Browser tests used an
isolated copy, Playwright 1.64.1 and existing Chromium; the delivered screenshots
and historical JSON results below were preserved. Current counts supersede the
older counts for this rerun only. See `PUBLICATION.md` for scope.

This did not build/run the native host or execute Windows storage, telemetry,
DPI, input or overlay acceptance. Those remain pending. The following sections
describe the original delivery environment and evidence, not this rerun.

## Actual environment

Linux container; Node.js 22.16.0; Python 3.13.5; Chromium 144.0.7559.96; GCC 14.2.0; CMake 3.31.6; Ninja. No Windows desktop, MSVC toolchain or Windows SDK was available. These version numbers describe the test environment, not required runtime versions or claims about latest releases.

## Executed successfully

| Check | Result | Evidence / scope |
|---|---|---|
| JavaScript syntax | Passed | `npm run check`, all production UI modules |
| Model/unit suite | **58 passed, 0 failed** | `npm test`, 33 existing model checks plus 25 chart/presentation helpers |
| Generated metric definitions | Consistent | Running `node scripts/sync-metrics.mjs` left `native/MetricDefinitions.h` unchanged; 49 base descriptors |
| Portable C++ build | Passed | `cmake --preset portable-tests`, `cmake --build --preset portable-tests`, GCC |
| Portable C++ test | **1 test passed, 12 assertions/checks** | `ctest --preset portable-tests`, `TelemetryMath.h` only |
| Existing frontend interactions | **25 passed; no uncaught JavaScript errors** | `python tests/browser_test.py`, machine-readable `browser-test-results.json` |
| Revision frontend interactions | **59 passed; no uncaught JavaScript errors** | `python tests/revision_browser_test.py`, machine-readable `revision-browser-test-results.json` |
| Actual UI screenshots | Captured and visually inspected | Overview, compact VRAM, GPU Work, widget library; additional theme/preset captures included |

The final syntax/model/portable/browser runs were repeated after the reference renderer, middle-click/hover changes, the split-track fix, and cleanup of screenshot fixtures. The two browser suites contain **84 interaction assertions in total**, not 84 Windows integration tests. The default reference UI displays the explicit **DEMO** label even while paused. Example preset JSON was generated from the same model as the built-ins, not invented as an incompatible documentation fixture.

## What those tests cover

The 33 model checks cover fresh single-cell layouts, nested irregular splits, immutable source trees, node/parent lookup, sibling promotion on removal, widget swaps, recursive minimum dimensions, duplicate/path-like IDs, axis/ratio validation, depth and 128-leaf limits, preset serialization, unknown schema rejection, bounded undo/redo, settings/color sanitization, history retention and missing values, units/escaping, chart scaling/decimation/gradient helpers, catalog IDs, per-logical-processor subscriptions, VRAM dependencies, and explicit unavailable CUDA in the simulator.

The 25 interaction checks operate on the actual application DOM and handlers: nested split buttons, assignment from the widget library, click-to-focus and exact restoration, pointer-dragged splitter ratio, undo/redo, layout lock, preset save dialog/geometry, chart settings, refresh interval, theme change, nine-pane Overview, all 24 simulated logical processors, shrinking to 510×365 without hiding panes or mutating the tree, growing back, pause, raw network scale with Mbps display, single-pane VRAM and cold session reload. Preview named presets stay separate from the preview session draft. Widget swap is model-tested; pointer drag-and-drop swap still needs native acceptance.

The 12 portable C++ checks cover elapsed-time rates, counter resets, invalid intervals, CPU idle/kernel convention, percentage clamping, busiest-engine rather than sum/mean math and deterministic identity hashing. They do **not** call Windows APIs.

The additional 25 pure checks cover the independent chromeHidden flag/defaults, preset compatibility, seven registered skins, concrete color parsing/mixing, per-family palettes and explicit overrides, actual-crest gradient anchoring, multistop alpha fades and zero fill, nearest-sample binary selection, sample-distance tolerance and explicit gaps, timestamp/elapsed text and normalized raw values.

The 59 revision interaction checks cover middle-button default prevention and exactly-once toggling; all four bars hidden/restored; the same live canvases and unchanged tree/outer dimensions; left focus/right menu/wheel independence; keyboard and Escape recovery; saved compact preset and cold preview restore; actual timestamp/value inspector and bounds; per-family reference colors; **real Canvas pixel** warm-to-violet and fading-alpha assertions; raw/normalized/missing sample readouts; CPU mini and Mbps network tooltips; seven skin choices and stable layout; custom CSS Canvas recoloring; reset-to-skin; all nine panes retained when small; full grid-track allocation at minima; and no uncaught JS errors. Several entries exercise the same invariant separately on each skin.

The Windows storage test source also now checks absent/invalid chromeHidden defaults, independence from density, and a true flag surviving native atomic JSON roundtrip. That Windows-only test **was not executed here**.

## Screenshot provenance

All PNGs in `screenshots/` are screen captures of this project's real frontend, not newly generated mockups:

- `overview.png`: 1320×830, nine performance panes with Midnight theme.
- `gpu-work.png`: 720×390, asymmetric VRAM + Compute + 3D.
- `vram-only.png`: 440×310 compact one-cell view.
- `widget-library.png`, `themes.png`, `presets.png`: actual dialogs.
- `gpu-work-compact.png`, `overview-compact.png`: the real charts-only layout at unchanged outer viewport sizes.
- `gpu-hover.png`, `comparison-hover.png`: actual DOM/Canvas hover inspector and crosshairs.
- `skin-midnight.png`, `skin-graphite.png`, `skin-aurora.png`, `skin-amethyst.png`, `skin-cobalt.png`, `skin-ember.png`, `skin-ivory.png`: each built-in skin on GPU Work.

Values are synthetic, explicitly labelled preview data. Hardware strings in them are fixture labels, not measurements or hardware detection of the test container. `design/reference.png` and `design/chart-target.png` are separately the user-supplied mockups used as visual targets, not evidence of program execution. Charts-only captures intentionally hide the footer/DEMO badge along with other chrome; their readings are still simulated. Screenshots are visual inspection artifacts, not live hardware benchmarks.

## Browser-harness limitations

Managed browser policy in the environment blocks normal page navigation. The optional test harness therefore inlines trusted local assets, uses a test-only TypeScript module conversion and substitutes a memory-backed localStorage. It does not alter the production application files or browser policy. Production loads the original modules from a mapped local origin.

Consequently these runs do **not** validate the production Content Security Policy, native WebView2 message transport, Windows disk persistence or window controls. Preview persistence success means the frontend invoked the preview adapter correctly; it is not a native filesystem test. Browser tests deliberately expose no real telemetry and do not certify resource usage.

## Not executed / not claimed

The native Win32/WebView2 executable has **not been compiled or run**. Windows schema/atomic-write tests in `tests/storage_validation_tests.cpp` are supplied but not executed here. The GitHub Actions Windows workflow is supplied but has not been run as part of delivery. There is no prebuilt Windows binary and no claim that an initial Windows integration build is guaranteed error-free.

Real CPU/GPU/disk/network counter availability and values, NVML ABI support on the target drivers, high-core-count machines, non-English Windows, changed/multiple GPUs, monitor/DPI restoration, native dialog behavior, keyboard/input/IME, full-window composition transparency and cross-application click-through remain pending Windows validation. No measured CPU/RAM overhead or broad hardware compatibility number is asserted. Click-through is guarded in code and resets at startup, but still requires actual OS acceptance.

Complete `WINDOWS_ACCEPTANCE.md` before release. Record compiler/runtime/driver versions and actual results; do not convert pending items to passed based only on source inspection or a pretty screenshot.
