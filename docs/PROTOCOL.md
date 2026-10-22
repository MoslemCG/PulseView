# Native / web protocol v1

Production transport: `window.chrome.webview.postMessage(object)` to native, and `PostWebMessageAsJson` to the web view. All messages come from the private local application origin. There are no host objects, remote endpoints or arbitrary code execution methods.

## Envelopes

```json
{"v":1,"id":"17","method":"window.state","params":{}}
```

```json
{"v":1,"id":"17","ok":true,"result":{"width":720,"height":390}}
```

```json
{"v":1,"id":"17","ok":false,"error":{"message":"Human-readable explanation"}}
```

```json
{"v":1,"event":"metrics","data":{"timestamp":1790000000000,"values":{"cpu.usage":23.2,"gpu.cuda":null}}}
```

IDs are request-scoped strings, at most 80 characters natively; total inbound JSON is at most 4 MiB. `params` must be an object. The bridge times out ordinary requests after 15 seconds; an export request may wait up to five minutes for its native file dialog. Dialog timeout is not an instruction to overwrite/export without consent.

## Requests

| Method | Params | Result / effect |
|---|---|---|
| `app.ready` | `{}` | Initial session, saved presets, custom themes, native capabilities and data path; starts collector. Must be first. |
| `app.diagnostics` | `{}` | Native version/runtime, data path, capabilities, collector diagnostics and actual settings. |
| `app.openFolder` | `{folder:"data"|"presets"|"themes"|"exports"}` | Opens only an allowed application folder. No arbitrary path. |
| `monitor.configure` | `{settings:{...}, metrics:["cpu.usage", ...]}` | Configures sampling/retention-related interests; result `{applied:...}`. |
| `monitor.pause` | `{paused:boolean}` | Sets manual pause; result `{paused:...}`. Minimized/background pause is additional native state. |
| `presets.list` | `{}` | Valid named presets, sorted by name. Corrupt files are logged/skipped. |
| `presets.save` | `{preset:{...}, preserveWindow?:boolean}` | Validates and saves named preset; returns saved object. Normally captures actual window geometry. Import uses `preserveWindow` to retain imported geometry. |
| `presets.delete` | `{id:string}` | Deletes named JSON and its backup after UI confirmation. |
| `presets.export` | `{preset:{...}}` | Native Save dialog then atomic write; `{path:...}` or `{cancelled:true}`. |
| `session.save` | `{session:{...}}` | Saves validated current draft, substituting actual native settings/window. |
| `window.state` | `{}` | Normal DIP geometry, monitor-relative x/y, monitor name, DPI, maximized flag. |
| `window.apply` | `{window:{...}}` | Restores/clamps geometry; returns actual applied geometry. |
| `window.minimum` | `{width:number,height:number}` | Updates desired minimum size, capped against work area when Windows requests limits. |
| `window.chrome` | `{hidden:boolean}` | Changes only native `settings.chromeHidden`; returns `{hidden:boolean}`. Does not change opacity, sampling, click-through or outer geometry. Rejects non-boolean input. |
| `window.configure` | `{settings:{...}, allowClickThrough?:boolean}` | Applies sanitized settings/topmost/opacity; click-through requires explicit true permission + recovery capability. Returns `{settings:...}`. |
| `window.command` | `{command:"minimize"|"maximize"|"close"|"drag"}` | Narrow native window operation. Drag is posted outside callback. |
| `themes.list` | `{}` | User CSS records `{id,name,css}` from disk. Built-ins live in UI. |
| `themes.install` | `{id:"custom-...",name:string,css:string}` | Validates ID/size; atomic-write theme file. |

There is no `presets.import` RPC: the UI reads a chosen JSON file, validates and assigns a new ID, then calls `presets.save` with `preserveWindow:true`. There is no generic filesystem import or command RPC.

## Events

| Event | Data |
|---|---|
| `catalog` | `{metrics:[descriptors], system:{...}, diagnostics:[...]}` including discovered device-specific metrics. |
| `metrics` | `{timestamp: epochMilliseconds, values:{metricId:number|null}}` |
| `pause` | `{paused:boolean}` including background pause. |
| `nativeSettings` | Actual sanitized workspace settings after tray/recovery actions. |
| `windowChanged` | Notification after debounced move/resize; UI schedules a new draft. |
| `saveRequested` | Graceful-close/session notification. |
| `presetHotkey` | `{index:0..8}` for first nine alphabetically sorted saved presets. |
| `notice` | `{message:string,error?:boolean}` for user-visible status. |

Metric descriptors include `id`, `label`, `category`, `unit`, `color`, `source`, `available`, `reason`, `device`, optional `max`, and a `group` such as `logical` for the CPU bundle. Treat missing values as unavailable, not zero. IDs and descriptor optional fields are defined by `catalog.js` and the dynamic C++ catalog; do not infer hardware identity from a display name alone.

## Threading and reentrancy

The JavaScript request handler is reached through a posted deferred action. All WebView2 methods run on the main STA thread. Workers send packets through `WM_APP`, never COM calls. Native save/confirm dialogs must remain outside WebView callback stacks. Any new asynchronous native operation must preserve the request ID and reply once.

## Preview adapter

When `window.chrome.webview` does not exist, `Bridge` explicitly enters browser-demo mode. It simulates metrics and uses a separate `pulseview.preview.*` localStorage namespace. Native-only capabilities are false. Browser preview cannot resize a desktop HWND or verify file persistence. A native failure does not switch this mode on.

## Saved presentation state (1.1.0)

`settings.chromeHidden` is optional in schema v1 and defaults to false in JS and C++. It is not `settings.compact` (spacing density), not pane focus and not fullscreen. `window.chrome` updates the authoritative native settings because `session.save` substitutes those settings when writing disk. `nativeSettings` sent after overlay recovery includes `chromeHidden:false`; the frontend must restore the global bars. Existing clients that never send the new flag retain normal bars.
