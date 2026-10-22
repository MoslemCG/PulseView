import { leaf, split, uid } from './layout.js';
import { makeWidget } from './catalog.js';
export const DEFAULT_SETTINGS = Object.freeze({
    refreshSeconds: 1, theme: 'midnight', alwaysOnTop: false, opacity: 1, clickThrough: false,
    layoutLocked: false, pauseWhenMinimized: true, minimizeToTray: false, closeToTray: false,
    focusOnChartClick: true, retentionSeconds: 600, restoreWindow: true, compact: true, chromeHidden: false,
    timeCompression: false, historyNormal: 120, historyCompressed: 600, compressStart: .25, compressFactor: 4,
});
export function cleanSettings(input = {}) {
    const s = { ...DEFAULT_SETTINGS, ...input };
    for (const k of ['alwaysOnTop', 'clickThrough', 'layoutLocked', 'pauseWhenMinimized', 'minimizeToTray', 'closeToTray', 'focusOnChartClick', 'restoreWindow', 'compact', 'chromeHidden', 'timeCompression'])
        s[k] = s[k] === true;
    s.refreshSeconds = Number.isFinite(+s.refreshSeconds) ? Math.min(60, Math.max(.25, +s.refreshSeconds)) : 1;
    s.opacity = Number.isFinite(+s.opacity) ? Math.min(1, Math.max(.25, +s.opacity)) : 1;
    s.retentionSeconds = Number.isFinite(+s.retentionSeconds) ? Math.min(3600, Math.max(60, +s.retentionSeconds)) : 600;
    const num = (k, lo, hi, def) => { s[k] = Number.isFinite(+s[k]) ? Math.min(hi, Math.max(lo, +s[k])) : def; };
    num('historyNormal', 15, 3600, 120); num('historyCompressed', 15, 3600, 600); num('compressStart', 0, .9, .25); num('compressFactor', 1, 16, 4);
    s.theme = typeof s.theme === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(s.theme) ? s.theme : 'midnight';
    return s;
}
const w = (id, opts = {}) => leaf({ ...makeWidget(id), ...opts });
function p(id, name, layout, width, height, description) {
    return { schemaVersion: 1, id, name, builtin: true, description, layout, settings: { ...DEFAULT_SETTINGS }, window: { width, height, maximized: false } };
}
export function builtins() {
    const overview = split('y', split('x', w('gpu.compute'), split('x', w('gpu.vram.used'), split('x', w('cpu.usage'), leaf(makeWidget('net.download', 'network')), .50), .3143), .30), split('y', split('x', leaf(makeWidget('cpu.usage', 'comparison')), leaf({ ...makeWidget('cpu.usage', 'cores'), coreColumns: 8 }), .62), split('x', w('gpu.3d'), split('x', w('memory.used'), leaf(makeWidget('disk.read', 'disk')), .50), .34), .53), .35);
    return [
        p('builtin-overview', 'Overview', overview, 1320, 830, 'Reference-inspired overview. Every tile is an independent split leaf.'),
        p('builtin-gpu', 'GPU Work', split('x', w('gpu.vram.used'), split('y', w('gpu.compute'), w('gpu.3d'), .55), .49), 720, 390, 'VRAM + GPU Compute + 3D. An intentionally asymmetric layout.'),
        p('builtin-cpu', 'CPU Cores', split('y', w('cpu.usage', { stats: false }), leaf(makeWidget('cpu.usage', 'cores')), .28), 720, 480, 'Total CPU with all logical-processor micro-charts.'),
        p('builtin-network', 'Network', split('y', leaf(makeWidget('net.download', 'network')), split('x', w('memory.used'), w('cpu.usage'), .52), .60), 560, 470, 'Network, RAM and CPU.'),
        p('builtin-vram', 'VRAM Only', w('gpu.vram.used', { historySeconds: 300 }), 390, 250, 'A single small VRAM chart.'),
        p('builtin-blank', 'Empty Canvas', leaf(), 480, 330, 'Start with exactly one cell. Split any cell in either direction.'),
    ];
}
export function firstSession() {
    const s = p('session', 'Unsaved layout', w('gpu.vram.used'), 440, 310, '');
    s.builtin = false;
    return s;
}
export function userPreset(name, layout, settings, window) { return { schemaVersion: 1, id: uid(), name, layout, settings, window, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() }; }
