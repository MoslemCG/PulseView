# README media provenance

Captured on 22 October 2026 using `scripts/capture-readme.py` and an existing
Chromium installation. README media lives under `screenshots/readme/`.

All README media captures PulseView's actual HTML/CSS/Canvas frontend served from
local `ui` files. No generated mockup substitutes for the UI. Production CSP and
original ES modules are served intact; developer automation supplies showcase
samples through the browser-preview inspection hook.

Readings are **synthetic**. The user requested varied demonstration curves instead
of flat idle traces. The script creates complete chronological one-second samples
over ten minutes. GPU/CPU bursts, allocation changes and traffic peaks have different
phases; CPU mini-charts have individual load patterns. Capacities and units remain
consistent, and CUDA remains unavailable in this fixture.

The script rejects a native bridge, pauses the demo timer and replaces only that
fresh preview page's in-memory samples. It changes no native collector, production
asset or saved user preset. Every frame carries a visible `DEMO · SYNTHETIC DATA`
badge, including charts-only mode.

| Asset | Demonstration |
|---|---|
| `overview.png` | Nine-pane workspace and metric colors |
| `recursive-splits.gif` | Actual split buttons and undo handlers |
| `live-workload.gif` | Three synthetic workload states shown as a short time-lapse |
| `cpu-cores.png` | Logical-processor histories and load colors |
| `network.png` | Receive/transmit, RAM and CPU |
| `sample-hover.png` | Recorded-sample hover |
| `time-compression.png` | Ten-minute compressed view |
| `charts-only.gif`, `charts-only.png` | Middle-click handler and retained layout |
| `vram-only.png` | Compact single-pane preset |
| `skins.gif`, `themes.png` | Eight actual CSS skins and Appearance dialog |
| `widget-library.png`, `presets.png`, `settings.png` | Feature-specific dialogs |
| `about.png` | Current version in About PulseView (added for the installer release) |

GIFs encode screenshots of real UI states. They are demonstrations, not native
telemetry recordings or benchmark evidence. Desktop captures made during preparation
were excluded from this set to avoid personal interface labels and idle flat traces.

Visual review checked Overview and GPU Work at full size, other assets in a contact
sheet and animation states: distinct non-flat curves, sharp text, balanced chart
space, unclipped dialogs, visible disclosure and no private paths, real interface
aliases or user preset names. Intermediate frames/contact sheets stay under ignored
`out/readme-media/`; only selected reviewed media is public.
