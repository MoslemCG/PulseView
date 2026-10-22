/** Pure chart geometry/color helpers. No DOM, no simulated telemetry. */
export const clamp01 = n => Math.max(0, Math.min(1, n));
export const DEFAULT_FILL_OPACITY = 0.44;

export function parseColor(value) {
    const s = String(value || '').trim();
    if (/^#[0-9a-f]{3,4}$/i.test(s)) {
        const p = s.slice(1).split('').map(c => parseInt(c + c, 16));
        return [...p.slice(0, 3), p.length === 4 ? p[3] / 255 : 1];
    }
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) {
        const p = s.slice(1).match(/../g).map(c => parseInt(c, 16));
        return [...p.slice(0, 3), p.length === 4 ? p[3] / 255 : 1];
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
        const p = m[1].trim().split(/[\s,\/]+/);
        if (p.length < 3 || p.length > 4 || p.some(v => !/^[-+]?[\d.]+%?$/.test(v))) return null;
        const rgb = p.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(255, parseFloat(v) * (v.endsWith('%') ? 2.55 : 1)))));
        const a = p.length === 4 ? clamp01(parseFloat(p[3]) / (p[3].endsWith('%') ? 100 : 1)) : 1;
        if ([...rgb, a].every(Number.isFinite)) return [...rgb, a];
    }
    return null;
}
export function rgba(color, alpha) {
    const c = parseColor(color) || [40, 160, 255, 1];
    return `rgba(${c[0]},${c[1]},${c[2]},${clamp01(Number.isFinite(alpha) ? alpha : 1) * c[3]})`;
}
export function mixColor(a, b, weight = 0.5) {
    const x = parseColor(a) || [40, 160, 255, 1], y = parseColor(b) || x;
    const t = clamp01(weight);
    return '#' + x.slice(0, 3).map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, '0')).join('');
}
/** The bright stop starts at the visible curve's crest, NOT at 100% of the axis.
 * This is why even a 15%-loaded chart still has a saturated upper fill. */
export function gradientExtent(points, min, max, top, height) {
    let peak = min;
    for (const p of points) if (Number.isFinite(p.v)) peak = Math.max(peak, p.v);
    const span = Math.max(Number.EPSILON, max - min);
    const y = top + height * (1 - clamp01((peak - min) / span));
    return { top: Math.min(y, top + height - 1), bottom: top + height };
}
/** Screen <-> time mapping for the compressed time axis. Screen fraction p and age fraction a are
 * both measured from the right edge (now). Time per pixel is 1 over the first `start` of the width,
 * then rises linearly to `factor` at the left edge; factor 1 is the ordinary linear axis. */
export function timeWarp(start = .25, factor = 1) {
    const s = Math.min(.95, clamp01(start)), k = (Math.max(1, factor) - 1) / (2 * (1 - s)), total = 1 + k * (1 - s) ** 2;
    return {
        age: p => { const q = Math.max(0, clamp01(p) - s); return (Math.min(clamp01(p), s) + q + k * q * q) / total; },
        screen: a => { const A = clamp01(a) * total; return A <= s || !k ? A : s + (Math.sqrt(1 + 4 * k * (A - s)) - 1) / (2 * k); },
    };
}
/** Load band from the mean of recorded samples in the last `windowMs`: <50 low, 50–80 mid, ≥80 high.
 * Gaps are skipped, never counted as zero; no samples → null. */
export function loadLevel(points, now, windowMs = 5000) {
    let sum = 0, n = 0;
    for (let i = points.length - 1; i >= 0 && points[i].t > now - windowMs; i--)
        if (points[i].t <= now && Number.isFinite(points[i].v)) { sum += points[i].v; n++; }
    if (!n) return null;
    const mean = sum / n;
    return mean >= 80 ? 'high' : mean >= 50 ? 'mid' : 'low';
}
/** Nearest timestamp, including explicit nulls. Never bridge a telemetry gap.
 * Inputs are sorted by timestamp; returns the actual sample, not interpolation. */
export function nearestSample(points, target, { start = -Infinity, end = Infinity, maxDistance = Infinity } = {}) {
    if (!points.length || !Number.isFinite(target) || target < start || target > end) return null;
    let lo = 0, hi = points.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (points[mid].t < target) lo = mid + 1; else hi = mid; }
    let best = null;
    for (const i of [lo - 1, lo]) {
        const p = points[i];
        if (p && p.t >= start && p.t <= end && (!best || Math.abs(p.t - target) < Math.abs(best.t - target))) best = p;
    }
    return best && Math.abs(best.t - target) <= maxDistance ? best : null;
}
export function localTimeText(t) {
    const d = new Date(t), pad = (v, n = 2) => String(v).padStart(n, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
export function relativeTimeText(t, now) {
    const elapsed = Math.max(0, now - t) / 1000;
    return elapsed < .05 ? 'Now' : `−${elapsed.toFixed(1)} s`;
}
/** Per-family color ramps. Custom CSS and per-widget overrides remain first-class. */
export function chartPalette(line, read) {
    const key = line.colorKey || 'cpu';
    const color = line.color || read(key, '#a2ef21');
    const bottom = line.bottom || read(`${key}-fill-bottom`, read('chart-bottom', '#151b45'));
    const top = line.colorOverride ? color : read(`${key}-fill-top`, color);
    const mid = line.bottomOverride || line.colorOverride ? mixColor(color, bottom, .5) : read(`${key}-fill-mid`, mixColor(top, bottom, .48));
    const highlight = line.colorOverride ? mixColor(color, '#ffffff', .3) : read(`${key}-highlight`, mixColor(color, '#ffffff', .32));
    return { color, top, mid, bottom, highlight };
}
/** Same-hue ramp that stays tinted down to the baseline (dark, never fully transparent). */
export function fillStops(palette, opacity = DEFAULT_FILL_OPACITY, gain = 1) {
    const a = clamp01(opacity * gain * 1.4);
    return [[0, rgba(palette.top, a)], [.25, rgba(mixColor(palette.top, palette.mid, .5), a * .78)], [.55, rgba(palette.mid, a * .52)], [.82, rgba(palette.bottom, a * .3)], [1, rgba(palette.bottom, a * .16)]];
}
/** Blurred wide strokes of the curve (clipped to the fill) brighten each column right under
 * its own sample, so the fill follows the curve instead of one global crest. */
export function hugBands(plotHeight, opacity = DEFAULT_FILL_OPACITY, gain = 1) {
    const a = clamp01(opacity * gain / DEFAULT_FILL_OPACITY);
    return [{ width: plotHeight * .8, blur: plotHeight * .18, alpha: a * .3 }, { width: plotHeight * .2, blur: plotHeight * .05, alpha: a * .34 }];
}
