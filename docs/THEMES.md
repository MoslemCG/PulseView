# CSS skins and chart fidelity — 1.1.0

The original visual target is `design/reference.png`. `design/chart-target.png` is the previously supplied GPU Work mockup refining the chart treatment. **Neither is a screenshot of this code.** Actual frontend captures are in `screenshots/`. Match the thin vivid traces, restrained halos and layered underfills—not merely the overall navy background. Never change measured values or fabricate fluctuations to imitate the reference's graph shapes.

Eight built-in CSS skins are registered in `ui/core/themes.js`: **Midnight · Reference, Graphite, Onyx, Aurora, Amethyst, Cobalt, Ember and Ivory**. The first six are dark, the last light. All use the same split layout and chart implementation. Skins change colors, not widget assignments or geometry.

## Install a custom skin

Edit `examples/custom-ocean.css` (complete ramp example) or `examples/custom-ember.css`, then choose **Appearance / skins → Install CSS theme**. The UI assigns a safe `custom-...` ID. The native host writes `%LOCALAPPDATA%\PulseView\themes\<id>.css`. Alternatively, put a CSS file with an ASCII-safe filename there and select Reload themes. `/* @name Display name */` supplies a friendly name. Maximum CSS file size is 256 KiB.

Use `:root` for imported CSS; it is inserted after the built-ins. A skin needs no rebuild, network request, web font or JavaScript. Unspecified properties inherit Midnight defaults. If you change a chart family color, also define its `-fill-top`, `-fill-mid`, `-fill-bottom` and optional `-highlight` tokens; otherwise you intentionally retain the reference ramp for that family. `var(--gpu)` in a CSS token is resolved by the browser before Canvas reads it.

Existing widgets with explicit line/gradient colors or fill strength **keep those choices**. To apply the new default style to an older saved widget, choose **Widget settings → Use skin chart style → Apply**, then save the preset. The reset changes only color choice/overrides, line width and fill opacity. It preserves history, metric, axes, grid, units, scale, title, pane size and tree.

## Surface and text tokens

| Token | Purpose | Midnight |
|---|---|---|
| `--bg`, `--title` | Workspace, title/toolbar | `#060f1c`, `#091426` |
| `--panel`, `--panel-top` | Pane body/header | `#0a1625`, `#0c1a2b` |
| `--border`, `--border-soft` | Strong/subtle separation | `#1b3046`, `#15283a` |
| `--grid` | Fine chart grid | `#132438` |
| `--popup`, `--input`, `--hover` | Dialog/field/hover | `#0d1c30`, `#0a182a`, `#142a42` |
| `--text`, `--muted`, `--faint` | Text hierarchy | `#e6edf8`, `#839db8`, `#516b87` |
| `--accent`, `--accent-soft` | Selection/control accent | `#26aaff`, `#0c2d4b` |
| `--chart-tooltip-bg`, `--chart-tooltip-border` | Hover inspector surface | `#0b1a2d`, `#27445f` |
| `--pane-radius`, `--pane-padding` | Compact proportions | `5px`, `12px` |
| `--font` | Installed system font stack | Segoe UI Variable / Segoe UI / Arial |

## Per-family chart ramps

The underfill has two layers: a vertical ramp (top → mid → bottom) anchored at the visible crest, plus a blurred glow of the curve itself clipped to the fill, so every column is brightest right under its own sample. `--chart-fill-hug` (0–2, default 1) scales that glow; `--chart-fill-gain` scales both.

For each family `gpu`, `vram`, `cpu`, `ram`, `net`, `upload`, `copy`, define:

```css
:root {
  --vram: #ffad0a;                 /* sharp main curve and numerical accent */
  --vram-fill-top: #ff9a1a;        /* bright area hugging the curve */
  --vram-fill-mid: #9a4a0c;        /* same-hue intermediate fade */
  --vram-fill-bottom: #2e1608;     /* dark same-hue tint at the baseline */
  --vram-highlight: #ffda61;       /* very thin bright highlight on the curve */
}
```

| Family | Main curve | Upper fill | Mid fill | Lower tint |
|---|---|---|---|---|
| GPU | `#f52cdd` | `#f322e6` | `#8a1284` | `#2c0a3e` |
| VRAM | `#ffad0a` | `#ff9a1a` | `#9a4a0c` | `#2e1608` |
| CPU | `#a3ef25` | Main curve | `#4d8a14` | `#122a0c` |
| RAM | `#a568ff` | Main curve | `#5a2aa8` | `#1c1040` |
| Network receive | `#25afff` | Main curve | `#0b62b8` | `#081d42` |
| Upload/write | `#b747ff` | Main curve | `#6420a8` | `#1e0c3c` |
| Copy/secondary | `#31d9bd` | Main curve | `#148a78` | `#082a2a` |

`--chart-bottom` is only the fallback when a family has no lower tint; it no longer forces every graph toward one identical purple. When explicit widget line/bottom overrides are set, the renderer derives a compatible middle/highlight while respecting those overrides.

### Shape of the fade

Let `a = clamp(widget.fillOpacity × --chart-fill-gain, 0, 1)`. New widgets default to fillOpacity **0.44**, lineWidth **1.5 CSS pixels**. Existing saved values are retained.

The gradient spans the **actual visible curve's highest Y to the baseline**, not the entire axis height. Consequently a chart running at 15% still has a colored upper edge. The five stops in `chart-model.js` are:

| Position | Color | Alpha |
|---|---|---|
| 0 | family top | a |
| 0.14 | top blended 68% toward mid | 0.75a |
| 0.45 | family mid | 0.67a |
| 0.78 | family bottom | 0.36a |
| 1 | family bottom | 0.035a |

This is a shared vertical gradient per visible series, not a physically simulated glow around each individual sample. Shorter traces occupy proportionally less area; samples and scales stay true. All underfills are drawn before all crisp curves so a subsequent series cannot obscure an earlier series' stroke. Opacity accumulates where translucent series overlap.

### Stroke and glow controls

```css
:root {
  --chart-fill-gain: 1;            /* 0..2, multiplies saved widget opacity */
  --chart-glow-radius: 4.5;        /* 0..16, restrained halo in regular plots */
  --chart-glow-opacity: .30;       /* 0..1 */
  --chart-highlight-opacity: .42;  /* 0..1 */
}
```

The renderer draws a soft halo, a saturated base stroke and a narrow highlight. Mini CPU charts use a smaller halo for legibility. Set glow opacity to zero for a fully crisp, non-glowing style. Optional `--chart-bg` supplies a plot background and `--chart-crosshair` changes the hover crosshair; defaults preserve the panel surface and use muted crosshairs.

Use concrete hex or `rgb()/rgba()` values for chart tokens. The pure helper accepts 3/4/6/8-digit hex and comma/space RGB with optional alpha. Do not use named colors, unresolved `color-mix()` or `oklch()` expressions in chart tokens: Canvas accepts more syntax than the custom blending helper. Surface CSS may use normal CSS features. Unitless numeric tokens must be finite values. Never supply font binaries.

## Compact mode, hover and safety

Skins must not override `.chrome-hidden` behavior, hide leaves, redefine split positions or force cards out at a breakpoint. Keep pane text legible on every skin, including tooltip labels and the light skin. Global bars can be restored by middle-click, Ctrl+Shift+C, Escape or the context menu. Native tray/global recovery also restores them. Click-through input needs native recovery before mouse controls can work.

Do not add remote `@import`, `url(...)` fonts or external backgrounds. Production CSP blocks remote resources; install only trusted local CSS. Full CSS can still obscure controls. To recover from a broken skin, close the app, run `PulseView.exe --safe-mode`, and fix/remove the file from the theme folder. Named presets are not deleted.

## Visual acceptance

Inspect actual Overview at 1320×830, GPU Work at 720×390, VRAM Only at 440×310, and Charts only at the same outer sizes. Check line hue, thin highlight, nuanced fade and subtle grid; make sure no chart is blurry from CSS scaling. Compare equal plot sizes where possible: different aspect ratios or real measurements cannot have pixel-identical traces. Check hover at corners, narrow panes, multiple series and mini CPU charts. Complete native 100%/150%/200% DPI acceptance on Windows; browser screenshots do not establish Windows rendering parity.
