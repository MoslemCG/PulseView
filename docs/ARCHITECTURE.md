# Architecture

## Execution model

```text
Windows read-only APIs + optional NVIDIA NVML
             │  background collector thread
             ▼
Telemetry packets {catalog?, metrics?}
             │  coalesced WM_APP notification
             ▼
Application (main Win32 STA thread)
  ├─ window/tray/hotkeys/DPI/settings
  ├─ Storage: AppData JSON/CSS + atomic backups
  └─ WebViewHost: composition controller + private local origin
             │  versioned JSON RPC and events
             ▼
Bridge → HistoryStore → WidgetViews → Canvas charts
                 ↘ recursive split-tree renderer
```

The frontend is plain ES modules. No React, Node runtime, chart library, online font or local HTTP listener is required in production. The development preview server and test bundler are deliberately separate tools.

## Layout model and rendering

`layout.js` owns immutable tree operations. Leaves have an ID and optional widget. Internal nodes have an ID, axis, local ratio and two children. `x` means left/right; `y` means top/bottom. The renderer uses a local two-track CSS grid **per split**; this is not a uniform dashboard grid. Non-aligned subdivisions are natural consequences of the tree.

For a leaf, minimum size is 152 × 110 CSS pixels. With gutter `g = 6`:

- `x`: `minWidth = left.minWidth + right.minWidth + g`; `minHeight = max(left.minHeight, right.minHeight)`.
- `y`: `minWidth = max(top.minWidth, bottom.minWidth)`; `minHeight = top.minHeight + bottom.minHeight + g`.

The workspace gets this recursive minimum and scrolls when necessary. Native minimum track size is capped to the monitor work area so a large hierarchy cannot make window controls permanently unreachable. Stored ratios survive ordinary viewport resize. Pointer movement updates only its own split; release commits a single undoable edit. Keyboard arrow adjustment and divider double-click equalization are supported.

The renderer normally owns one `WidgetView` per leaf. Focus mode renders one selected leaf while retaining the complete canonical tree unchanged. Leaving focus reinstantiates the normal view. Empty leaf, widget selection and focus are distinct states. Drag-handle exchanges change widget assignments, not node positions.

## State ownership

| State | Owner / persistence |
|---|---|
| Recursive tree and widget options | Frontend current workspace; explicit preset + auto session |
| Native geometry, actual topmost/opacity/click-through | Application; reflected into saved snapshots |
| Theme and collection/display settings | Current workspace; mirrored through validated native configuration |
| Focus, open menus, selected leaf, undo stack | Transient UI state; not persisted as a destructive layout change |
| Measurements | Worker produces snapshots; bounded frontend history, not saved to preset files |
| Device catalog and supported readings | Native collector discovery; browser preview uses separate fixture |
| Named presets | `Storage`, one JSON file per safe ID |

Named Save and session autosave are intentionally separate. New imports get new IDs. Missing hardware does not delete the corresponding widget. Window restoration uses DIPs plus monitor-relative position, with safe fallback to a connected display.

## Telemetry loop

`Telemetry` owns one worker, a condition variable and a settings revision. Providers are activated from metric subscriptions; startup and periodic discovery refresh the catalog. Discovery may temporarily collect more than visible metrics to discover hardware, so "unused" is not a promise that a provider is never queried.

PDH wrappers prime rate counters and filter invalid/non-finite values. Network deltas use actual elapsed monotonic time. The worker maintains provider baselines across ordinary polls and resets them across pause/activation as needed. It returns `null` for data not currently available. Full hardware semantics are in `METRICS.md`.

Packets are coalesced at the native window to avoid an unbounded queue if the UI is busy. This can drop intermediate visual samples during a long modal action; it does not fabricate a flat historical line. The UI uses real sample timestamps and bounded ring-like histories with at most 14,400 samples per metric and a configurable time retention.

## Charts and colors

Canvas charts draw in CSS dimensions with a capped device-pixel scale. They resize via `ResizeObserver`, resolve CSS color tokens, and use requestAnimationFrame only when invalidated. Sampling frequency is not rendering frequency. Line gaps represent missing readings. Min/max envelope decimation keeps spikes visible when there are more samples than horizontal pixels.

Axes operate in raw units. Display formatting happens last: bytes can become GiB; network bytes/second can become Mbps. A combined chart with incompatible units uses a clearly labelled normalized mode. Memory capacity is an appropriate fixed maximum when known. The line and its transparent fill use the same semantic color; the lower gradient blend comes from the theme.

## Native host

The main process is an STA Win32 window with PerMonitorV2 awareness and custom HTML title controls. DirectComposition hosts the WebView2 composition visual; an effect controls whole-client opacity. WebView2 composition hosting requires mouse/cursor/focus forwarding. Top-level native resize hit tests are kept separate from web content. Touch/pen, accessibility and advanced IME need explicit Windows acceptance; no unsupported input mode is claimed as tested.

Modal export/confirmation UI is posted to the normal message loop, not invoked directly from a WebView2 callback. `ScriptDialogOpening` retains a deferral until the posted dialog action completes. Closing stops the worker before destroying the WebView/window. Session saving gets a short graceful close window, but sudden process termination can still lose the most recent unsaved draft; named files have atomic replacement/backups.

Click-through and transparent composition are native-only features. The implementation pairs layered/transparent extended styles for hit testing with a composition opacity effect. Their interaction with current Windows/WebView2/DWM builds must be tested on Windows. Recovery availability is checked before enabling click-through, and restarts reset it.

## Files and security

UI loads only from a mapped application-local virtual origin. Navigation outside that origin, popups, permission requests and WebView downloads are rejected. There are no host objects and no generic shell/filesystem bridge. Content Security Policy disallows remote scripts/connections and object/frame embedding. CSS customization is trusted local styling, not an executable plugin mechanism.

File IDs are restricted to ASCII letters/digits/underscore/hyphen; path traversal is rejected. JSON files are bounded to 4 MiB, widget payloads to 64 KiB, theme CSS to 256 KiB, tree depth to 32 and leaves to 128. Temporary-write + flush + backup + rename prevents partially written named files under ordinary failures. These protections do not make untrusted administrator-modified local application files safe.

## Known extension boundaries

Independent physical cores are not synthesized by arbitrarily averaging SMT threads. A per-core aggregation needs an explicit topology/method contract. GPU sensors do not supply CPU temperature. Browser preview cannot validate native storage, opacity, click-through, WebView2 CSP or real driver counters. Native Windows compilation and acceptance remain mandatory before release.

## Charts-only transition and local sizing (1.1.0)

The global bars are siblings of `#workspace`. Toggling `html.chrome-hidden` removes only those bars from layout and reduces workspace padding. `setChromeHidden` updates that flag and calls the narrow `window.chrome` RPC. It does **not** call the pane renderer, clear histories or issue `window.apply`. ResizeObserver then reflows existing canvases and updates the recursive window minimum. The CSS flag is persisted independently from `compact` spacing. Middle down is cancelled to prevent autoscroll; middle `auxclick` performs the one toggle on release.

Each split's CSS fractional weights are stored ratio × 100, not raw sub-unit fractions. This avoids empty tracks when the other child is clamped to its minimum. Sums/ratios and the saved tree remain unchanged. Minimum-size scrolling is still the fallback for an oversized hierarchy.

## Reference chart rendering and inspection (1.1.0)

`chart-model.js` contains testable color conversion/mixing, per-family ramp resolution, gradient extent and binary-search nearest-sample selection. Rendering uses the current visible window only. Each path is segmented at nulls or excessive sample gaps; extrema-preserving decimation affects drawing, not hover or history. Gradient stops span the actual visible crest to baseline. All fills are drawn first, then restrained halos, saturated sharp strokes, and thin highlights. No smoothing changes the recorded trace.

The inspector uses original visible samples, not decimated points. It snaps within a cadence-aware tolerance and shows No sample across gaps. A tooltip DOM node is attached to the pane rather than clipped inside a small canvas; it includes the sample timestamp, relative time, displayed Y values, optional normalized/raw pairs and a separately identified mouse-coordinate Y. Crosshairs and sample markers are Canvas overlays. Placement is clamped within the pane. All event listeners and tooltip nodes are released by Chart.destroy; chart-only transitions deliberately do not destroy charts. The browser-only test hook exposes debug geometry for tests and is absent in the native app.
