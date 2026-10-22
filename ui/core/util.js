export const $ = (q, root = document) => root.querySelector(q);
export const $$ = (q, root = document) => [...root.querySelectorAll(q)];
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function debounce(fn, ms) { let timer; const f = (...a) => { clearTimeout(timer); timer = setTimeout(() => fn(...a), ms); }; f.cancel = () => clearTimeout(timer); return f; }
export function format(value, unit = '%', style = 'auto', precision = 1) {
    if (!Number.isFinite(value))
        return { number: '—', unit: '' };
    if (unit === '%')
        return { number: value.toFixed(precision === 0 ? 0 : Math.abs(value) < 10 ? 1 : 0), unit: '%' };
    if (unit === 'bytes' || unit === 'B/s') {
        const rate = unit === 'B/s';
        if (rate && style === 'Mbps')
            return { number: (value * 8 / 1e6).toFixed(precision), unit: 'Mbps' };
        if (rate && style === 'MB/s')
            return { number: (value / 1e6).toFixed(precision), unit: 'MB/s' };
        // Auto-scaled bits; like auto bytes, the smallest step is kilo so idle links never read "B".
        if (rate && style === 'bits') {
            const bits = value * 8, i = Math.max(1, Math.min(4, Math.floor(Math.log(Math.max(Math.abs(bits), 1)) / Math.log(1000))));
            return { number: (bits / 1000 ** i).toFixed(precision), unit: ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'][i] };
        }
        if (!rate && style === 'GiB')
            return { number: (value / 2 ** 30).toFixed(precision), unit: 'GiB' };
        const base = rate ? 1000 : 1024;
        const suffixes = rate ? ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'] : ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
        const i = Math.max(rate ? 1 : 0, Math.min(4, Math.floor(Math.log(Math.max(Math.abs(value), 1)) / Math.log(base))));
        return { number: (value / base ** i).toFixed(i === 0 ? 0 : precision), unit: suffixes[i] };
    }
    if (unit === 'MHz' && style !== 'MHz')
        return { number: (value / 1000).toFixed(2), unit: 'GHz' };
    return { number: value.toFixed(['count', 'rpm'].includes(unit) ? 0 : precision), unit: unit === 'count' ? '' : unit };
}
export function formatText(value, unit, style = 'auto', precision = 1) { const f = format(value, unit, style, precision); return `${f.number}${f.unit === '%' ? '' : ' '}${f.unit}`.trim(); }
export function downloadJson(name, obj) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function fieldNumber(form, name, min, max, fallback) {
    const raw = form.elements.namedItem(name)?.value;
    const value = raw === '' || raw == null ? fallback : Number(raw);
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}
