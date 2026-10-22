# PulseView source changelog

## 1.1.1 — 22 October 2026

- Made About discoverable with a labeled footer button containing the version.
- Added versioned About to each pane's context menu, including Charts-only mode.
- Corrected README directions: there is no separate Help menu.
- Shortened both READMEs and added verified GitHub-to-local release synchronization.

## 1.1.0 distribution — 22 October 2026

- Added public Windows Setup and portable ZIP packaging, app-local C++ runtime,
  and conditional Microsoft WebView2 bootstrapper installation.
- Added version display to the footer and About PulseView, with package.json as
  the shared authority for frontend, native executable properties and installer.
- Added direct download instructions at the top of both READMEs.
- Matching version tags publish a GitHub Release only after native build/tests
  and an isolated install/uninstall and user-data preservation smoke test.

## 1.1.0 — 26 September 2026

### Implemented in code

- Rebuilt the actual Canvas area/line renderer to match the supplied references: independent color ramps for every metric family, bright stops anchored to the visible trace, translucent multi-stop fade, saturated thin stroke, restrained glow and hairline highlight. Data is not smoothed or invented for aesthetics.
- Added middle-click **Charts only** presentation. Titlebar, toolbar, focus strip and footer disappear/reappear together; chart instances, split ratios, history and outer window dimensions are preserved. Added Ctrl+Shift+C, context-menu recovery, Escape semantics and native Alt+drag.
- Persisted `settings.chromeHidden` independently from density, with backward-compatible default false and a narrow `window.chrome` native RPC. Tray/global recovery also restores the bars.
- Added real-sample X/Y hover inspectors and crosshairs to all chart forms including CPU mini-charts: local timestamp/milliseconds, elapsed time, value/units, normalized/raw readings, No sample for gaps and bounded placement. Alt+wheel scrolls long inspectors.
- Expanded bundled CSS skins from four to seven: Midnight, Graphite, Aurora, Amethyst, Cobalt, Ember and Ivory. Added ramp/glow/tooltip CSS tokens and a full custom Ocean example. Existing explicit widget colors remain intact; Use skin chart style resets appearance only.
- Fixed local split fractional weights leaving unused space when a sibling hit its minimum. Saved ratios and the recursive nonuniform layout model are unchanged.
- Added pure chart-model tests, actual Canvas pixel/interaction regression tests and native compact-preset storage assertions. Updated both READMEs, agent handoff, protocol, themes, architecture, acceptance checklist and source manifest.

### Validation boundaries

See `docs/TEST_REPORT.md` for executed counts and evidence. Frontend tests use actual project code with simulated readings. Portable C++ math tests run on Linux. The Win32/WebView2 host and native filesystem/window/input behavior are **not compiled or executed in this delivery environment**. This archive contains source, not a Windows EXE.

### Compatibility

Preset schema remains v1. Old files missing chromeHidden open with bars visible. Existing fill/line settings are never silently overwritten. Use **Widget settings → Use skin chart style → Apply** for old widgets whose saved subdued colors should adopt the new look. Use a newly built EXE with the matching UI folder because the new UI invokes window.chrome.
