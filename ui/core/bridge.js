/** Narrow versioned message bridge. Browser preview is explicitly a demo, never a native fallback. */
import { demoCatalog, demoSample } from './demo.js';
export class Bridge extends EventTarget {
    constructor() {
        super();
        this.native = !!window.chrome?.webview;
        this.seq = 0;
        this.pending = new Map();
        this.timer = null;
        this.settings = { refreshSeconds: 1 };
        if (this.native)
            window.chrome.webview.addEventListener('message', e => this.receive(e.data));
    }
    receive(m) { if (!m || typeof m !== 'object')
        return; if (m.event)
        this.emit(m.event, m.data);
    else if (m.id && this.pending.has(m.id)) {
        const p = this.pending.get(m.id);
        clearTimeout(p.timeout);
        this.pending.delete(m.id);
        m.ok ? p.resolve(m.result) : p.reject(new Error(m.error?.message || 'Native request failed.'));
    } }
    emit(name, data) { this.dispatchEvent(new CustomEvent(name, { detail: data })); }
    on(name, fn) { this.addEventListener(name, e => fn(e.detail)); }
    async call(method, params = {}) {
        if (!this.native)
            return this.demoCall(method, params);
        const id = String(++this.seq);
        return new Promise((resolve, reject) => { const timeout = setTimeout(() => { this.pending.delete(id); reject(new Error(`Native request timed out: ${method}`)); }, method === 'presets.export' ? 300000 : 15000); this.pending.set(id, { resolve, reject, timeout }); window.chrome.webview.postMessage({ v: 1, id, method, params }); });
    }
    read(key, def) { try {
        return JSON.parse(localStorage.getItem(`pulseview.preview.${key}`)) ?? def;
    }
    catch {
        return def;
    } }
    write(key, value) { localStorage.setItem(`pulseview.preview.${key}`, JSON.stringify(value)); }
    startDemo() {
        clearInterval(this.timer);
        if (!this.paused)
            this.timer = setInterval(() => this.emit('metrics', demoSample(Date.now())), this.settings.refreshSeconds * 1000);
    }
    async demoCall(method, p) {
        switch (method) {
            case 'app.ready': {
                const catalog = demoCatalog();
                // Preview alone is prefilled, with a visible DEMO badge. Live mode starts empty history.
                setTimeout(() => { this.emit('catalog', catalog); let now = Date.now(); for (let i = 600; i >= 0; i--)
                    this.emit('metrics', demoSample(now - i * 1000)); this.startDemo(); }, 50);
                return { session: this.read('session', null), presets: this.read('presets', []), themes: this.read('themes', []), capabilities: { native: false, recoveryHotkey: false, opacity: false, clickThrough: false }, dataPath: 'Browser demo storage (not Windows preset files)' };
            }
            case 'monitor.configure':
                this.settings = { ...this.settings, ...p.settings };
                this.startDemo();
                return { applied: this.settings };
            case 'monitor.pause':
                this.paused = !!p.paused;
                this.startDemo();
                return { paused: this.paused };
            case 'presets.list': return this.read('presets', []);
            case 'presets.save': {
                const preset = { ...p.preset, builtin: false, window: p.preset.window || { width: innerWidth, height: innerHeight, x: 0, y: 0, dpi: 96, maximized: false } };
                const list = this.read('presets', []);
                const idx = list.findIndex(x => x.id === preset.id);
                if (idx >= 0)
                    list[idx] = preset;
                else
                    list.push(preset);
                this.write('presets', list);
                return preset;
            }
            case 'presets.delete':
                this.write('presets', this.read('presets', []).filter(x => x.id !== p.id));
                return {};
            case 'session.save':
                this.write('session', p.session);
                return {};
            case 'window.apply': return { applied: p.window, preview: true };
            case 'window.state': return { width: innerWidth, height: innerHeight, x: 0, y: 0, dpi: 96, maximized: false };
            case 'window.minimum': return {};
            case 'window.chrome':
                if (typeof p.hidden !== 'boolean') throw new Error('hidden must be a boolean.');
                this.settings.chromeHidden = p.hidden;
                return { hidden: p.hidden };
            case 'window.configure': return { ...p, preview: true };
            case 'themes.list': return this.read('themes', []);
            case 'themes.install': {
                const list = this.read('themes', []).filter(x => x.id !== p.id);
                list.push(p);
                this.write('themes', list);
                return p;
            }
            case 'app.diagnostics': return { mode: 'Browser demo', ...demoCatalog(), dataPath: 'localStorage' };
            case 'app.openFolder': throw new Error('Opening the Windows data folder requires the desktop app. Preview presets use browser storage.');
            case 'window.command':
                if (p.command === 'close')
                    throw new Error('Close this browser tab to exit the preview.');
                return {};
            default: throw new Error(`Unsupported preview request: ${method}`);
        }
    }
}
