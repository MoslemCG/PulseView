import { clamp, formatText } from './util.js';
import { rgba, gradientExtent, nearestSample, chartPalette, fillStops, hugBands, timeWarp, DEFAULT_FILL_OPACITY } from './chart-model.js';
export { rgba } from './chart-model.js';
export function themeColor(key, fallback = '#25a8ff') { return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || fallback; }
export const niceMax = v => { if (!Number.isFinite(v) || v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v)), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
/** Min/max envelope downsampling retains short spikes without an unbounded path. */
export function decimate(points, pixels) {
    if (points.length <= pixels * 2 || pixels < 1) return points;
    const result = [], size = Math.ceil(points.length / pixels);
    for (let i = 0; i < points.length; i += size) {
        const bin = points.slice(i, i + size);
        if (bin.some(p => !Number.isFinite(p.v))) { result.push(...bin); continue; }
        let lo = bin[0], hi = bin[0];
        for (const p of bin) { if (p.v < lo.v) lo = p; if (p.v > hi.v) hi = p; }
        result.push(...(lo.t <= hi.t ? [lo, hi] : [hi, lo]));
    }
    return result;
}
const numberToken = (read, key, fallback, lo = 0, hi = 10) => {
    const v = parseFloat(read(key, ''));
    return Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
};
const tooltipNumber = (v, unit, style) => unit === '%' && Number.isFinite(v) ? `${v.toFixed(1)}%` : formatText(v, unit, style, 2);

export class Chart {
    constructor(canvas, options = {}) {
        this.canvas = canvas; this.options = options; this.lines = []; this.now = Date.now(); this.pointer = null;
        // `selection` is a recorded sample ({id, t}) chosen only when the pointer moves; redraws
        // from new data keep that sample instead of re-targeting whatever is now under the cursor.
        this.selection = null; this.repick = false;
        this.observer = new ResizeObserver(() => { this.pointer = null; this.hideTooltip(); this.schedule(); });
        this.observer.observe(canvas);
        this.move = e => {
            if (e.buttons) { this.leave(); return; }
            const r = canvas.getBoundingClientRect();
            this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; this.repick = true; this.schedule();
        };
        this.leave = () => { this.pointer = null; this.hideTooltip(); this.schedule(); };
        this.down = () => this.leave();
        canvas.addEventListener('pointermove', this.move);
        canvas.addEventListener('pointerleave', this.leave);
        canvas.addEventListener('pointerdown', this.down);
    }
    update(lines, options = {}) { this.lines = lines; this.options = { ...this.options, ...options }; this.now = Number.isFinite(options.now) ? options.now : Date.now(); this.schedule(); }
    schedule() { if (this.frame || this.destroyed) return; this.frame = requestAnimationFrame(() => { this.frame = 0; this.draw(); }); }
    hideTooltip() { this.selection = null; this.hoverState = null; }
    destroy() {
        this.destroyed = true; this.observer.disconnect(); cancelAnimationFrame(this.frame);
        this.canvas.removeEventListener('pointermove', this.move); this.canvas.removeEventListener('pointerleave', this.leave);
        this.canvas.removeEventListener('pointerdown', this.down);
    }
    draw() {
        const c = this.canvas, r = c.getBoundingClientRect(), w = Math.floor(r.width), h = Math.floor(r.height);
        if (w < 2 || h < 2) { this.hideTooltip(); return; }
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
        const ctx = c.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
        const style = getComputedStyle(document.documentElement), read = (k, fallback = '') => style.getPropertyValue(`--${k}`).trim() || fallback;
        const opt = this.options, mini = !!opt.mini, axes = opt.axes && !mini && w >= 145 && h >= 70;
        const start = this.now - (opt.seconds || 120) * 1000;
        const visible = this.lines.map(line => ({ ...line, points: line.points.filter(p => p.t >= start && p.t <= this.now) }));
        let ymax = opt.max, ymin = Number.isFinite(opt.min) ? opt.min : 0;
        if (!Number.isFinite(ymax)) {
            let peak = 0;
            for (const l of visible) for (const p of l.points) if (Number.isFinite(p.v)) peak = Math.max(peak, p.v);
            ymax = niceMax(peak * 1.12);
        }
        if (ymax <= ymin) ymax = ymin + 1;
        this.range = { min: ymin, max: ymax };
        ctx.font = '10px "Segoe UI", sans-serif';
        const axisLabels = Array.from({ length: 5 }, (_, i) => { const v = ymax - i * (ymax - ymin) / 4; return opt.normalized ? `${v.toFixed(0)}%` : formatText(v, opt.unit || '%', opt.unitStyle, 0); });
        const labelWidth = axes ? Math.ceil(Math.max(...axisLabels.map(t => ctx.measureText(t).width))) + 9 : 2;
        const margin = { l: labelWidth, r: 4, t: mini ? 3 : 6, b: axes ? 6 : 3 }, pw = w - margin.l - margin.r, ph = h - margin.t - margin.b;
        if (ph < 3 || pw < 3) { this.hideTooltip(); return; }
        const bottom = margin.t + ph, right = margin.l + pw;
        this.plot = { x: margin.l, y: margin.t, width: pw, height: ph, start, end: this.now };
        // Optional compressed axis: x is placed by age through the warp; linear otherwise.
        const span = this.now - start, warp = opt.warp ? timeWarp(opt.warp.start, opt.warp.factor) : null;
        const X = t => { const a = clamp((this.now - t) / span, 0, 1); return margin.l + pw * (1 - (warp ? warp.screen(a) : a)); };
        const T = x => { const p = clamp((margin.l + pw - x) / pw, 0, 1); return this.now - span * (warp ? warp.age(p) : p); };
        const Y = v => margin.t + ph * (1 - clamp((v - ymin) / (ymax - ymin), 0, 1));
        ctx.fillStyle = read('chart-bg', 'transparent'); ctx.fillRect(margin.l, margin.t, pw, ph);
        if (opt.grid) {
            ctx.lineWidth = 1; ctx.strokeStyle = read('grid', '#132438'); ctx.globalAlpha = mini ? .42 : .72;
            ctx.beginPath();
            const horizontal = mini ? 2 : 4, vertical = Math.max(1, Math.min(14, Math.floor(pw / (mini ? 36 : 42))));
            for (let i = 0; i <= horizontal; i++) { const y = Math.round(margin.t + i * ph / horizontal) + .5; ctx.moveTo(margin.l, y); ctx.lineTo(right, y); }
            // Equal time steps, so a compressed axis visibly packs its grid toward the past.
            for (let i = 0; i <= vertical; i++) { const x = Math.round(X(start + i * span / vertical)) + .5; ctx.moveTo(x, margin.t); ctx.lineTo(x, bottom); }
            ctx.stroke(); ctx.globalAlpha = 1;
        }
        if (axes) {
            ctx.fillStyle = read('muted', '#839db8'); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
            // Y labels only: the time axis is implicit (history window ending at now).
            for (let i = 0; i <= 4; i++) ctx.fillText(axisLabels[i], margin.l - 6, margin.t + i * ph / 4);
        }
        ctx.save(); ctx.beginPath(); ctx.rect(margin.l, margin.t, pw, ph + 1); ctx.clip();
        const geometry = visible.map(line => {
            const palette = chartPalette(line, read), pts = decimate(line.points, pw), finite = pts.filter(p => Number.isFinite(p.v));
            // One continuous path: a missed or late sample is drawn as a straight join from the last
            // received value to the next one. Hover still reads only recorded samples, never the join.
            const segments = finite.length ? [finite] : [];
            const extent = gradientExtent(line.points, ymin, ymax, margin.t, ph);
            const grad = ctx.createLinearGradient(0, extent.top, 0, extent.bottom);
            // Several overlapping fills are thinned so a lower series is never buried.
            const share = 1 / Math.sqrt(Math.max(1, visible.length));
            const stops = fillStops(palette, opt.fillOpacity ?? DEFAULT_FILL_OPACITY, numberToken(read, 'chart-fill-gain', 1, 0, 2) * share);
            for (const [offset, color] of stops) grad.addColorStop(offset, color);
            const paths = segments.map(seg => {
                const stroke = new Path2D(), fill = new Path2D();
                fill.moveTo(X(seg[0].t), bottom);
                seg.forEach((p, i) => { if (i) stroke.lineTo(X(p.t), Y(p.v)); else stroke.moveTo(X(p.t), Y(p.v)); fill.lineTo(X(p.t), Y(p.v)); });
                fill.lineTo(X(seg.at(-1).t), bottom); fill.closePath();
                return { seg, stroke, fill };
            });
            const hug = hugBands(ph, opt.fillOpacity ?? DEFAULT_FILL_OPACITY, numberToken(read, 'chart-fill-gain', 1, 0, 2) * numberToken(read, 'chart-fill-hug', 1, 0, 2) * share);
            return { line, palette, pts, paths, extent, grad, stops, hug };
        });
        this.styleDebug = geometry.map(g => ({ id: g.line.id, ...g.palette, extent: g.extent, stops: g.stops }));
        // All fills first, then all crisp strokes: a later series cannot bury another line.
        for (const g of geometry) for (const path of g.paths) {
            if (opt.chart === 'bars') {
                ctx.fillStyle = g.grad;
                const bw = clamp(pw / Math.max(g.pts.length, 1) * .72, 1, 12);
                for (const p of path.seg) {
                    ctx.fillRect(X(p.t) - bw / 2, Y(p.v), bw, bottom - Y(p.v));
                    ctx.fillStyle = g.palette.color; ctx.fillRect(X(p.t) - bw / 2, Y(p.v), bw, 1); ctx.fillStyle = g.grad;
                }
            } else if (opt.chart !== 'line') {
                ctx.fillStyle = g.grad; ctx.fill(path.fill);
                ctx.save(); ctx.clip(path.fill); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
                for (const band of g.hug) {
                    ctx.filter = `blur(${band.blur.toFixed(1)}px)`; ctx.strokeStyle = rgba(g.palette.top, band.alpha); ctx.lineWidth = band.width; ctx.stroke(path.stroke);
                }
                ctx.filter = 'none';
                ctx.restore();
            }
        }
        const baseWidth = opt.lineWidth || 1.5;
        for (const g of geometry) for (const path of g.paths) {
            if (opt.chart === 'bars') continue;
            const width = mini ? Math.min(baseWidth, 1.35) : baseWidth;
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            // A restrained outer halo, a saturated stroke, then a hairline highlight.
            // Samples themselves are unchanged: no synthetic smoothing or new peaks.
            ctx.strokeStyle = rgba(g.palette.color, numberToken(read, 'chart-glow-opacity', .30, 0, 1));
            ctx.lineWidth = width + (mini ? .45 : .8);
            ctx.shadowColor = g.palette.color; ctx.shadowBlur = mini ? 1.8 : numberToken(read, 'chart-glow-radius', 4.5, 0, 16);
            ctx.stroke(path.stroke); ctx.shadowBlur = 0;
            ctx.strokeStyle = g.palette.color; ctx.lineWidth = width; ctx.stroke(path.stroke);
            ctx.strokeStyle = rgba(g.palette.highlight, numberToken(read, 'chart-highlight-opacity', .42, 0, 1));
            ctx.lineWidth = Math.max(.35, width * .36); ctx.stroke(path.stroke);
            if (path.seg.length === 1) { const p = path.seg[0]; ctx.fillStyle = g.palette.color; ctx.beginPath(); ctx.arc(X(p.t), Y(p.v), 1.6, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
        const hasData = geometry.some(g => g.paths.length);
        if (!hasData && !mini) {
            ctx.fillStyle = read('muted', '#839db8'); ctx.font = '11px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(opt.emptyLabel || 'Waiting for samples', margin.l + pw / 2, margin.t + ph / 2, pw - 8);
        }
        if (this.pointer && opt.tooltip !== false && this.pointer.x >= margin.l && this.pointer.x <= right && this.pointer.y >= margin.t && this.pointer.y <= bottom) {
            this.inspect({ ctx, opt, visible, read, start, X, Y, T, margin, pw, ph });
        } else this.hideTooltip();
    }
    /** Recorded sample of the series nearest the pointer, or null over a gap. */
    pick(visible, start, T, Y, opt) {
        const target = T(this.pointer.x);
        const maxDistance = Math.max(1, (opt.sampleMs || 1000) * .65);
        let best = null;
        for (const l of visible) {
            const near = nearestSample(l.points, target, { start, end: this.now, maxDistance });
            if (!near || !Number.isFinite(near.v)) continue;
            const d = Math.abs(Y(near.v) - this.pointer.y);
            if (!best || d < best.d) best = { id: l.id, t: near.t, d };
        }
        return best && { id: best.id, t: best.t };
    }
    inspect(g) {
        const { ctx, opt, visible, read, start, X, Y, T, margin, pw, ph } = g;
        if (this.repick) { this.selection = this.pick(visible, start, T, Y, opt); this.repick = false; }
        const line = this.selection && visible.find(l => l.id === this.selection.id);
        const sample = line?.points.find(p => p.t === this.selection.t && Number.isFinite(p.v));
        // The locked sample scrolled out of the window (or series disappeared): show nothing.
        if (!sample) { this.hoverState = null; return; }
        const color = line.color || read('cpu');
        const text = tooltipNumber(sample.v, opt.normalized ? '%' : (line.unit || opt.unit || '%'), opt.unitStyle);
        const rawText = opt.normalized && Number.isFinite(sample.raw) ? tooltipNumber(sample.raw, line.unit || opt.unit, line.unitStyle || opt.unitStyle) : '';
        const label = rawText ? `${rawText} · ${text}` : text;
        const time = sample.t, x = X(time), y = Y(sample.v);
        ctx.save(); ctx.beginPath(); ctx.rect(margin.l, margin.t, pw, ph); ctx.clip();
        ctx.lineWidth = 1; ctx.strokeStyle = read('chart-crosshair', rgba(read('muted', '#839db8'), .6)); ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, margin.t); ctx.lineTo(x, margin.t + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = read('panel', '#0a1625'); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
        // Value sits just above the point; below it when the plot's top edge leaves no room.
        const mini = !!opt.mini, size = mini ? 9 : 11, gap = 6;
        ctx.font = `600 ${size}px "Segoe UI", sans-serif`;
        const tw = ctx.measureText(label).width, below = y - gap - size < margin.t;
        const lx = clamp(x, margin.l + tw / 2 + 1, Math.max(margin.l + tw / 2 + 1, margin.l + pw - tw / 2 - 1));
        const ly = below ? y + gap : y - gap;
        ctx.textAlign = 'center'; ctx.textBaseline = below ? 'top' : 'bottom'; ctx.lineJoin = 'round';
        ctx.lineWidth = 3; ctx.strokeStyle = read('chart-tooltip-bg', read('panel', '#0a1625')); ctx.strokeText(label, lx, ly);
        ctx.fillStyle = color; ctx.fillText(label, lx, ly);
        this.hoverState = { time, x, y, id: line.id, value: sample.v, text: label, below,
            label: { x: lx - tw / 2, y: below ? ly : ly - size, width: tw, height: size } };
    }
}
