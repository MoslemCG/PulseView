# Preset schema v1

`examples/asymmetric-workspace.json` is an importable example generated from the actual frontend model. A simplified shape:

```json
{
  "schemaVersion": 1,
  "id": "example-asymmetric",
  "name": "GPU + CPU workspace",
  "layout": {
    "kind": "split", "id": "root", "axis": "x", "ratio": 0.45,
    "a": {"kind":"leaf","id":"vram","widget":{"type":"metric","metric":"gpu.vram.used"}},
    "b": {
      "kind":"split","id":"right","axis":"y","ratio":0.60,
      "a":{"kind":"leaf","id":"compute","widget":{"type":"metric","metric":"gpu.compute"}},
      "b":{"kind":"leaf","id":"cpu","widget":{"type":"metric","metric":"cpu.usage"}}
    }
  },
  "settings": {"theme":"midnight","refreshSeconds":1,"alwaysOnTop":true,"opacity":1,"clickThrough":false,"chromeHidden":false},
  "window": {"width":720,"height":390,"x":80,"y":80,"monitor":"","dpi":96,"maximized":false}
}
```

Widget defaults are filled/sanitized by `catalog.js`. The full generated example includes complete options. `x` divides left/right; `y` divides top/bottom. Each ratio belongs to that split only, so row/column boundaries need not align.

## Invariants

Node IDs must be unique across the tree and match `[A-Za-z0-9_-]{1,100}`. A leaf has `widget:null` or a widget object. A split has two children, a valid axis and a ratio in [0.02, 0.98]. Maximum depth is 32, maximum leaves 128. Preset names must be nonempty; native storage limits their UTF-8 representation to 400 bytes. Files are bounded to 4 MiB. Native filenames must match the preset ID.

Built-in preset IDs begin with `builtin-` and cannot be overwritten. Import creates a fresh user ID instead of silently replacing an existing saved preset. `createdAt`/`modifiedAt` are descriptive ISO timestamps; they are not time-series measurement data.

Save snapshots the current widgets/options, settings and native window geometry. The separate `session.json` draft uses the same schema but is not a named saved preset. Manual edits should be made with the application closed; keep a copy first. Backups end in `.json.bak` and are not additional items in the normal preset picker.

## Geometry and safety

Dimensions are DIPs (96ths of an inch in Windows scaling terms). Position is relative to a named monitor's work area. Missing monitors, changed DPI and smaller work areas cause deliberate clamping. Restore-window can be disabled. Click-through is recorded as a workspace setting but reset at app restart and requires an explicit enabling operation with functioning recovery facilities. Focus view is not saved by destroying the other leaves.

The UI retains all cells on window shrink; an oversized tree scrolls. Do not "fix" a layout by hiding a saved widget at a breakpoint. Configuration snapshots are not recorded metric history: historical samples survive preset switches only while still in the in-memory retention window during the current process session.

For a new schema version, implement migration and tests in both JS and C++ before changing `schemaVersion`. Never silently load incompatible trees as an empty preset and overwrite the source file.

## Presentation and chart defaults added in 1.1.0

`settings.chromeHidden` (boolean, default false) saves **Charts only** mode with each named preset and session draft. `settings.compact` remains the independent spacing-density switch. Existing schema-v1 presets are backward-compatible; no schema bump is required. Pane focus remains transient and the complete tree is always saved. Native overlay recovery deliberately sets `chromeHidden:false`; the next automatic draft reflects that recovery.

New widgets use fill opacity 0.44 and per-family skin ramps. Existing explicit `lineColor`, `gradientColor`, `color`, `fillOpacity` and `lineWidth` are preserved. The user may reset only chart appearance through **Use skin chart style**. A theme switch or application update must not silently rewrite these settings. `examples/asymmetric-workspace.json` remains a valid earlier preset; omitted presentation fields are filled by validators.
