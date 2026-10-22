import { Chart, themeColor } from './charts.js';
import { format, formatText, esc, $, clamp } from './util.js';
import { icon } from './icons.js';
import { safeWidget } from './catalog.js';
import { loadLevel, mixColor } from './chart-model.js';
/** App-wide time axis. A widget's own history wins; 0 follows normal/compressed history. */
let timeView = { compressed: false, normal: 120, compressedSeconds: 600, start: .25, factor: 4 };
export function setTimeView(v) { timeView = { ...timeView, ...v }; }
export const historyOf = w => w.historySeconds || (timeView.compressed ? timeView.compressedSeconds : timeView.normal);
export function widgetTitle(w, catalog) { if (w.title)
    return w.title; if (w.type === 'cores')
    return 'Logical CPU Processors'; if (w.type === 'comparison')
    return 'System Activity'; if (w.type === 'network')
    return 'Network'; if (w.type === 'disk')
    return 'Disk I/O'; return catalog.get(w.metric)?.label || w.metric; }
export function widgetIcon(w, catalog) { return w.type === 'cores' ? 'grid' : w.type === 'network' ? 'network' : w.type === 'disk' ? 'disk' : w.type === 'comparison' ? 'chart' : ({ CPU: 'cpu', Memory: 'memory', GPU: 'gpu', NVIDIA: 'gpu', Network: 'network', Disk: 'disk' }[catalog.get(w.metric)?.category] || 'chart'); }
export function requiredMetrics(w, catalog) {
    if (w.type === 'cores')
        return [...catalog.values()].filter(m => m.group === 'logical').map(m => m.id);
    if (w.type === 'comparison')
        return w.metrics;
    if (w.type === 'network')
        return w.metrics?.length >= 2 ? w.metrics.slice(0, 2) : ['net.download', 'net.upload', 'net.received', 'net.sent'];
    if (w.type === 'disk')
        return w.metrics?.length >= 2 ? w.metrics.slice(0, 2) : ['disk.read', 'disk.write', 'disk.active', 'disk.latency'];
    const extra = w.metric === 'gpu.vram.used' ? ['gpu.vram.total', 'gpu.vram.free', 'gpu.vram.percent'] : w.metric === 'memory.used' ? ['memory.total', 'memory.available', 'memory.percent'] : w.metric === 'cpu.usage' ? ['cpu.frequency', 'cpu.utility'] : w.metric.startsWith('gpu.') ? ['gpu.copy'] : [];
    return [w.metric, ...extra];
}
export class WidgetView {
    constructor(container, w, store, catalog) { this.el = container; this.w = safeWidget(w); this.store = store; this.catalog = catalog; this.charts = []; this.lastDraw = 0; this.build(); }
    build() {
        const w = this.w;
        if (w.type === 'cores') {
            const metrics = [...this.catalog.values()].filter(m => m.group === 'logical').sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
            this.coreMetrics = metrics;
            this.el.innerHTML = `<div class="core-grid">${metrics.map((m, i) => `<div class="core-tile" title="${esc(m.label)}"><canvas data-core="${i}"></canvas><b class="core-value" data-core-value="${i}">—</b></div>`).join('')}</div>`;
            if (!metrics.length)
                this.el.innerHTML = '<div class="empty-provider">Waiting for processor discovery…</div>';
            this.grid = $('.core-grid', this.el);
            metrics.forEach((m, i) => this.charts.push(new Chart($(`[data-core="${i}"]`, this.el), { mini: true })));
            this.resize = new ResizeObserver(() => { this.sizeCores(); this.update(true); });
            this.resize.observe(this.el);
            this.sizeCores();
            return;
        }
        if (['network', 'disk', 'comparison'].includes(w.type)) {
            const comparison = w.type === 'comparison';
            this.el.innerHTML = `${comparison ? '' : `<div class="dual-values"><div class="dual-item"><span class="metric-caption">${icon(w.type === 'network' ? 'down' : 'disk')} ${w.type === 'network' ? 'DOWNLOAD' : 'READ'}</span><strong class="read-value">—</strong></div><div class="dual-item"><span class="metric-caption">${icon(w.type === 'network' ? 'up' : 'disk')} ${w.type === 'network' ? 'UPLOAD' : 'WRITE'}</span><strong class="write-value">—</strong></div></div>`}<div class="multi-legend"></div><div class="chart-box"><canvas></canvas></div>${w.stats && !comparison ? '<div class="widget-footer"></div>' : ''}`;
            this.charts = [new Chart($('canvas', this.el))];
            return;
        }
        const d = this.catalog.get(w.metric);
        this.el.innerHTML = `<div class="metric-summary"><div class="primary-value"><strong>—</strong><span></span></div><div class="metric-extra"></div></div>${w.chart === 'meter' ? '<div class="capacity-track"><span></span></div>' : ''}${w.chart === 'number' ? '' : `<div class="chart-box"><canvas></canvas></div>`}${w.stats ? '<div class="widget-footer"></div>' : ''}`;
        if (w.chart === 'number')
            this.el.classList.add('number-widget');
        if (w.chart === 'meter')
            this.el.classList.add('meter-widget');
        if ($('canvas', this.el))
            this.charts = [new Chart($('canvas', this.el))];
        this.color = w.lineColor || themeColor(w.color === 'auto' ? (d?.color || 'cpu') : w.color);
        this.el.style.setProperty('--widget-color', this.color);
    }
    sizeCores() {
        if (!this.grid)
            return;
        const count = this.coreMetrics.length, w = this.grid.clientWidth, h = this.grid.clientHeight;
        // A manual column count is fixed on resize; rows always follow from the thread count.
        const cols = this.w.coreColumns || Math.max(1, Math.min(count, Math.round(Math.sqrt(count * Math.max(w, 1) / Math.max(h, 1) / 1.8))));
        this.grid.style.gridTemplateColumns = `repeat(${cols},minmax(52px,1fr))`;
        this.grid.style.gridTemplateRows = `repeat(${Math.ceil(count / cols)},minmax(48px,1fr))`;
    }
    descriptor(id) { return this.catalog.get(id) || { id, label: id, unit: '%', color: 'cpu', available: false, reason: 'Metric unavailable on this machine' }; }
    line(id, index = 0) {
        const d = this.descriptor(id), w = this.w;
        const colorKey = w.color === 'auto' ? (d.color || ['cpu', 'gpu', 'vram', 'net', 'upload'][index % 5]) : w.color;
        return { id, label: d.label, unit: d.unit, unitStyle: w.unit, colorKey,
            color: w.lineColor || themeColor(colorKey), colorOverride: !!w.lineColor,
            bottom: w.gradientColor || themeColor(`${colorKey}-fill-bottom`, themeColor('chart-bottom')),
            bottomOverride: !!w.gradientColor, points: this.store.get(id, historyOf(w)) };
    }
    options(d, extra = {}) {
        const w = this.w;
        return { now: this.store.lastTime || Date.now(), seconds: historyOf(w), warp: timeView.compressed ? { start: timeView.start, factor: timeView.factor } : null, unit: d.unit, unitStyle: w.unit, chart: w.chart, lineWidth: w.lineWidth, fillOpacity: w.fillOpacity, grid: w.grid, axes: w.axes, min: w.scale === 'fixed' ? w.fixedMin : 0, max: w.scale === 'fixed' ? w.fixedMax : d.max, sampleMs: (this.sampleSeconds || 1) * 1000, emptyLabel: d.reason || 'Waiting for samples', ...extra };
    }
    update(force = false) {
        const w = this.w, now = this.store.lastTime;
        if (!force && w.displaySeconds > 0 && now - this.lastDraw < w.displaySeconds * 1000)
            return;
        this.lastDraw = now;
        const value = id => this.store.value(id), ft = (id, style = w.unit) => formatText(value(id), this.descriptor(id).unit, style);
        if (w.type === 'cores') {
            const bg = themeColor('bg', '#060f1c');
            this.coreMetrics.forEach((m, i) => {
                const el = $(`[data-core-value="${i}"]`, this.el), line = this.line(m.id);
                // Each thread is colored by its own 5 s mean load: green / orange / red from the skin.
                const key = `load-${loadLevel(line.points, this.store.lastTime || now) || 'low'}`, color = themeColor(key);
                const tinted = { ...line, colorKey: key, color, colorOverride: false, bottom: themeColor(`${key}-fill-bottom`, mixColor(color, bg, .82)), bottomOverride: false };
                el.textContent = ft(m.id); el.style.color = color;
                this.charts[i].update([tinted], this.options(m, { mini: true, max: 100 }));
            });
            return;
        }
        if (['network', 'disk', 'comparison'].includes(w.type)) {
            const comparison = w.type === 'comparison';
            const ids = comparison ? w.metrics : w.metrics?.length >= 2 ? w.metrics.slice(0, 2) : w.type === 'network' ? ['net.download', 'net.upload'] : ['disk.read', 'disk.write'];
            let lines = ids.map((id, i) => this.line(id, i));
            const first = this.descriptor(ids[0]);
            const mixed = new Set(ids.map(id => this.descriptor(id).unit)).size > 1;
            const normalized = (comparison && !!w.normalized) || mixed;
            if (normalized)
                lines = lines.map(l => { const d = this.descriptor(l.id); const max = Number.isFinite(d.max) && d.max > 0 ? d.max : Math.max(1, ...l.points.filter(p => p.v !== null).map(p => p.v)); return { ...l, points: l.points.map(p => ({ ...p, raw: p.v, v: p.v === null ? null : 100 * p.v / max })) }; });
            if (!comparison) {
                $('.read-value', this.el).textContent = ft(ids[0]);
                $('.write-value', this.el).textContent = ft(ids[1]);
            }
            const legend = $('.multi-legend', this.el);
            legend.innerHTML = w.legend && comparison ? `${normalized ? '<span class="normalization-label" title="Each series divided by its capacity, or its peak in this visible history window">Normalized %</span>' : ''}${lines.map(l => `<span title="${esc(this.descriptor(l.id).source)}"><i style="background:${l.color}"></i>${esc(this.descriptor(l.id).label)} ${comparison ? `<b>${esc(ft(l.id))}</b>` : ''}</span>`).join('')}` : '';
            this.charts[0].update(lines, this.options(first, { max: normalized ? 100 : (w.scale === 'fixed' ? w.fixedMax : first.unit === '%' ? 100 : null), unitStyle: w.unit, normalized }));
            const footer = $('.widget-footer', this.el);
            if (footer) {
                const prefix = ids[0].slice(0, ids[0].lastIndexOf('.'));
                const defaultSeries = w.type === 'network' ? ids[0] === 'net.download' : ids[0] === 'disk.read';
                const matches = defaultSeries || ids[1].startsWith(prefix + '.');
                const base = defaultSeries ? (w.type === 'network' ? 'net' : 'disk') : prefix;
                const a = w.type === 'network' ? `${base}.received` : `${base}.active`, b = w.type === 'network' ? `${base}.sent` : `${base}.latency`;
                footer.innerHTML = matches && this.catalog.has(a) ? `<span>${w.type === 'network' ? 'Received' : 'Active'} <b>${esc(ft(a))}</b></span><span>${w.type === 'network' ? 'Sent' : 'Latency'} <b>${esc(ft(b))}</b></span>` : '<span>Custom series</span><span>Hover for values</span>';
            }
            return;
        }
        const d = this.descriptor(w.metric), v = value(w.metric), f = format(v, d.unit, w.unit);
        this.color = w.lineColor || themeColor(w.color === 'auto' ? (d.color || 'cpu') : w.color);
        this.el.style.setProperty('--widget-color', this.color);
        $('.primary-value strong', this.el).textContent = f.number;
        $('.primary-value span', this.el).textContent = f.unit;
        let extra = '', foot = '', fraction = null;
        if (w.metric === 'gpu.vram.used' || w.metric === 'memory.used') {
            const gpu = w.metric.startsWith('gpu'), total = gpu ? 'gpu.vram.total' : 'memory.total', free = gpu ? 'gpu.vram.free' : 'memory.available';
            fraction = value(total) > 0 && v !== null ? v / value(total) : null;
            extra = `<b>${fraction === null ? '—' : `${(fraction * 100).toFixed(0)}%`}</b><span>of ${esc(ft(total))}</span>`;
            foot = `<span>${gpu ? 'Headroom' : 'Available'} <b>${esc(ft(free))}</b></span><span>Capacity <b>${esc(ft(total))}</b></span>`;
        }
        else {
            extra = `<span>${esc(d.unit === '%' ? 'UTILIZATION' : d.unit === 'MHz' ? 'FREQUENCY' : d.unit === 'B/s' ? 'TRANSFER RATE' : 'CURRENT')}</span><span>${historyOf(w)}s history</span>`;
            const points = this.store.get(w.metric, historyOf(w)).filter(p => p.v !== null);
            const avg = points.length ? points.reduce((s, p) => s + p.v, 0) / points.length : null, peak = points.length ? Math.max(...points.map(p => p.v)) : null;
            foot = w.metric === 'cpu.usage' ? `<span>Clock <b>${esc(ft('cpu.frequency'))}</b></span><span>Peak <b>${esc(formatText(peak, d.unit))}</b></span>` : `<span>Average <b>${esc(formatText(avg, d.unit, w.unit))}</b></span><span>Peak <b>${esc(formatText(peak, d.unit, w.unit))}</b></span>`;
            if (w.chart === 'meter')
                fraction = Number.isFinite(v) ? (v - (w.scale === 'fixed' ? w.fixedMin : 0)) / ((w.scale === 'fixed' ? w.fixedMax : d.max || 100) - (w.scale === 'fixed' ? w.fixedMin : 0)) : null;
        }
        $('.metric-extra', this.el).innerHTML = extra;
        const track = $('.capacity-track', this.el);
        if (track) {
            track.hidden = fraction === null;
            track.firstElementChild.style.width = `${clamp(fraction || 0, 0, 1) * 100}%`;
        }
        const footer = $('.widget-footer', this.el);
        if (footer)
            footer.innerHTML = foot;
        if (this.charts.length) {
            const line = this.line(w.metric);
            this.charts[0].update([line], this.options(d, { chart: w.chart === 'meter' ? 'line' : w.chart }));
        }
        this.el.classList.toggle('unavailable', v === null);
    }
    destroy() { for (const c of this.charts)
        c.destroy(); this.resize?.disconnect(); }
}
