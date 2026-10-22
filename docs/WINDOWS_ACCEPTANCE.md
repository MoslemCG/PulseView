# Windows acceptance checklist — not yet executed

22 October 2026 update: the documented VS2022 Release preset, both native CTest
cases and packaging passed on GitHub run 39824960646. The version-display change
also passed a fresh local MSVC Release build, both native tests and portable CTest.
These are build/unit results only. All unchecked real-machine acceptance items
below remain pending; do not infer GPU, DPI or overlay correctness from CI.

**Initial delivery status:** the Windows host has not been compiled or run in this environment. Every checkbox below is pending. Source inspection, the Linux portable C++ test, Chromium UI tests and a CI workflow do not count as these tests passing. Record Windows build/runtime/driver versions and actual observations as you complete them.

## Build and packaging

- [x] Configure/build Release using the documented Visual Studio 2022 x64 preset; logs in GitHub run 39831019559.
- [x] Run `ctest --preset windows-release`, including native JSON/atomic-write validation.
- [x] Run `npm run check`, `npm test`; regenerate metric definitions and verify no unexpected drift.
- [x] CI-only Setup install/version/uninstall smoke; synthetic user data preserved (run 39831019559).
- [ ] Stage with `scripts/package.ps1`; launch the staged executable, not only the build-tree copy.
- [ ] Verify missing `ui` and missing WebView2 Runtime produce understandable errors, not a blank "success" window.
- [ ] Review final dependency notices; C++ runtime ships app-locally. Setup may install Microsoft's signed WebView2 bootstrapper when missing; production telemetry never downloads code.

## Native host and security

- [ ] Normal non-admin launch, no browser address bar/context menu, no webpage navigation or unexpected download.
- [ ] Production CSP loads original ES modules and local styles correctly; no remote requests.
- [ ] Tab/focus, Unicode text entry, clipboard, keyboard shortcuts, mouse wheel, dragging and resize all work in the composition host.
- [ ] Native confirmations and export dialogs work repeatedly without WebView2 reentrancy hangs.
- [ ] Try 100%, 150% and 200% DPI, maximized/normal, Snap, two monitors and disconnecting the saved monitor.
- [ ] Confirm minimized pause and close/minimize-to-tray options. Restart Explorer and verify tray/recovery behavior.
- [ ] Review accessibility/tab order and IME; explicitly test touch/pen before advertising support.

## Layout and persistence

- [ ] First launch is one VRAM cell. Empty Canvas is exactly one empty cell.
- [ ] Split arbitrary leaves in both directions; drag local dividers, equalize, rotate parent, exchange widgets, undo/redo and lock layout.
- [ ] Click a chart to focus; second click/Escape restores the exact saved tree/ratios.
- [ ] Shrink a complex workspace: no leaf is deleted/hidden; oversized content remains reachable by scrolling.
- [ ] Save at least three named presets with different trees, chart settings, native dimensions, themes and topmost settings. Close/reopen and switch among them.
- [ ] Check real `%LOCALAPPDATA%\PulseView\presets` files and backups; ensure session autosave never changes a named preset until Save.
- [ ] Import/export, duplicate, rename via save, delete with confirmation, invalid JSON/IDs/depth and unsupported schema are safe and understandable.
- [ ] Simulate unwritable folder/full disk carefully in a disposable test environment; original preset remains intact and failure is visible.
- [ ] Install/reload custom CSS; restart; safe-mode recovery from a bad stylesheet without deleting saved presets.

## Hardware correctness

- [ ] CPU total and all discovered logical processors under idle/single-thread/multithread load. Compare definitions and intervals, not exact unqualified equality to Task Manager.
- [ ] On a system with processor groups, confirm group/index mapping and no missing logical processors.
- [ ] Physical memory, commit and pool values have appropriate units/capacities; no false exact-match claim for Task Manager subcategories.
- [ ] NVIDIA GPU: 3D, compute, copy, encoding/decoding and dedicated/shared usage. Check actual driver engine names and process-instance aggregation.
- [ ] CUDA without a CUDA-named counter is explicitly unavailable; NVML overall busy is not substituted.
- [ ] GPU memory reflects whole-adapter usage with several GPU applications open, not only PulseView's own WebView2 process.
- [ ] Non-NVIDIA GPU, multiple adapters, integrated-only GPU, missing/disabled PDH counters and unavailable NVML produce labelled unavailable values, not zeros/dummy data.
- [ ] Explicit device selection remains associated with the intended hardware across relaunch; document identical-adapter identity limitations.
- [ ] Network receive/transmit Mbps conversion, actual elapsed-time rates, NIC down/up, default route/VPN change, counter reset and LAN traffic all behave honestly.
- [ ] Disk read/write/active/latency and volume capacity remain distinct; unavailable counters do not crash.
- [ ] Pause/sleep/resume produces fresh baselines and gaps instead of huge spikes or fabricated continuity.

## Whole-window opacity and click-through (critical native validation)

- [ ] Composition opacity at 100/85/50/25% affects the entire intended client content (charts, text, toolbar), remains readable and restores cleanly.
- [ ] Layered click-through with DirectComposition does not cause black/blank content on this Windows/WebView2/DWM build.
- [ ] Click-through actually forwards pointer input to **another application's** window, not just same-thread windows.
- [ ] Ctrl+Alt+Shift+F11 always restores input/visibility. Tray recovery works independently. Intentionally block hotkey registration: enabling click-through must be refused.
- [ ] Every restart begins interactive even after saving a click-through workspace. Safe mode brings the app onscreen.
- [ ] Exclusive-fullscreen games or protected windows may cover a topmost overlay; do not promise injection/exclusive-overlay behavior.

## Resource use and release decision

- [ ] Measure idle and active CPU/RAM/GPU use with one chart, Overview, all logical processors and 128 leaves at relevant refresh intervals; include WebView2 subprocesses.
- [ ] Long run, rapid preset switches and repeated dialogs do not grow histories/listeners/handles without bound.
- [ ] Record crash/recovery behavior, then decide release readiness based on actual observations. A signed installer/auto-update/security audit is separate work, not an automatic consequence of passing a UI screenshot test.

## Version 1.1.0 native interaction acceptance (pending Windows execution)

- [ ] Build and execute updated `storage_validation_tests`: absent/invalid chrome flag defaults to false, true survives native sanitization, dense spacing remains independent, and compact flag survives the atomic disk roundtrip.
- [ ] Physical middle click is forwarded by the WebView2 composition host once on release; no Windows autoscroll icon or duplicate toggle. Repeated toggles preserve outer HWND rectangle, leaf IDs, ratios, live sampling and histories.
- [ ] Titlebar, main toolbar, focus strip and footer all hide; all modular panes fill the freed area. Middle click again restores the bars. Left-click focus, right-click menus and mouse-wheel behavior remain independent.
- [ ] Save a compact named preset, quit/restart, load it, and switch to a normal preset: both correct presentation modes and window geometries return. Verify 100%, 150%, 200% DPI and constrained work areas.
- [ ] Ctrl+Shift+C toggles. Escape closes a dialog first, then restores the bars, then exits pane focus. Alt+left-drag in chart-only mode moves the window without changing a split ratio or focusing a pane.
- [ ] Native tray and global recovery restore bars even after a saved compact+click-through preset. A click-through window must not be expected to receive a middle click; recover native input first.
- [ ] Hover reads real timestamp/value pairs on CPU, per-logical-processor, VRAM, GPU, disk and network. Check live refresh, pause, missing counters, sleeps and provider gaps. Verify normalized plots show raw units, tooltip bounds at small sizes, and Alt+wheel for long inspectors.
- [ ] All seven skins and imported CSS repaint current canvases; existing per-widget color overrides persist. Reset-to-skin changes appearance only. Visually compare both references at matching plot size without altering measured traces to imitate fixture shapes.
