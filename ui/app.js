import { Bridge } from './core/bridge.js';
import { APP_VERSION } from './core/version.js';
import { leaf, split, leaves, find, parent, groupRoot, equalizeGroup, replace, divide, remove, swap, minSize, validatePreset, validateLayout, UndoStack, clone, uid, GUTTER } from './core/layout.js';
import { metricMap, makeWidget, safeWidget, WIDGET_TYPES } from './core/catalog.js';
import { builtins, firstSession, cleanSettings, DEFAULT_SETTINGS } from './core/presets.js';
import { HistoryStore } from './core/history.js';
import { WidgetView, widgetTitle, widgetIcon, requiredMetrics, setTimeView } from './core/widgets.js';
import { themeColor } from './core/charts.js';
import { DEFAULT_FILL_OPACITY } from './core/chart-model.js';
import { BUILTIN_THEMES, themeNames } from './core/themes.js';
import { icon } from './core/icons.js';
import { $, $$, esc, clamp, debounce, downloadJson, fieldNumber } from './core/util.js';
const bridge = new Bridge(), catalog = metricMap(), store = new HistoryStore(), undo = new UndoStack();
const builtinPresets = builtins();
let current = firstSession(), settings = cleanSettings(), selected = current.layout.id, focused = null, dirty = false, paused = false;
let userPresets = [], customThemes = [], views = [], capabilities = {}, dataPath = '', initialized = false, catalogSignature = '', system = {}, transitioning = false;
let redrawFrame = 0;
const root = $('#layout-root'), workspace = $('#workspace'), modal = $('#modal');
const toast = (message, error = false) => { const e = document.createElement('div'); e.className = `toast${error ? ' error' : ''}`; e.textContent = message; $('#toasts').append(e); setTimeout(() => e.remove(), error ? 9000 : 4000); };
const report = e => toast(e?.message || String(e), true);
const tryCall = async (method, params = {}) => { try {
    return await bridge.call(method, params);
}
catch (e) {
    report(e);
    return null;
} };
const withErrors = fn => (...a) => { try {
    return Promise.resolve(fn(...a)).catch(report);
}
catch (e) {
    report(e);
} };
function materializeIcons(scope = document) { $$('[data-icon]', scope).forEach(e => { e.innerHTML = icon(e.dataset.icon); e.removeAttribute('data-icon'); }); }
materializeIcons();
$('#app-version').textContent = `v${APP_VERSION}`;
$('#help-button').title = `About PulseView ${APP_VERSION} · Help`;
function setButtonIcon(id, name) { $(id).innerHTML = icon(name); }
function titleFor(id) { const n = find(current.layout, id); return n?.widget ? widgetTitle(n.widget, catalog) : 'Empty pane'; }
function markDirty() { dirty = true; $('#dirty').hidden = false; queueSession(); updateToolbar(); }
function updateToolbar() {
    $('#preset-name').textContent = current.name;
    $('#dirty').hidden = !dirty;
    $('#pane-count').textContent = `${leaves(current.layout).length} pane${leaves(current.layout).length === 1 ? '' : 's'}`;
    $('#lock-button').innerHTML = icon(settings.layoutLocked ? 'lock' : 'unlock') + `<span class="tool-label">${settings.layoutLocked ? 'Layout locked' : 'Edit layout'}</span>`;
    $('#lock-button').classList.toggle('active', settings.layoutLocked);
    $('#pin-button').classList.toggle('active', settings.alwaysOnTop);
    $('#pause-button').innerHTML = icon(paused ? 'play' : 'pause');
    $('#pause-button').classList.toggle('active', paused);
    $('#undo-button').disabled = !undo.undoItems.length || settings.layoutLocked;
    $('#redo-button').disabled = !undo.redoItems.length || settings.layoutLocked;
    $('#split-x-button').disabled = settings.layoutLocked;
    $('#split-y-button').disabled = settings.layoutLocked;
    root.classList.toggle('locked', settings.layoutLocked);
    document.documentElement.classList.toggle('compact', settings.compact);
    document.documentElement.classList.toggle('chrome-hidden', settings.chromeHidden);
    $('#chrome-button').setAttribute('aria-pressed', String(settings.chromeHidden));
    $('#compress-button').setAttribute('aria-pressed', String(settings.timeCompression));
    $('#compress-button').classList.toggle('active', settings.timeCompression);
    const select = $('#refresh-select');
    if (![...select.options].some(o => +o.value === settings.refreshSeconds))
        select.add(new Option(`${settings.refreshSeconds} s`, String(settings.refreshSeconds)));
    select.value = String(settings.refreshSeconds);
    $('#theme-label').textContent = customThemes.find(t => t.id === settings.theme)?.name || themeNames[settings.theme] || settings.theme;
    $('#focus-bar').hidden = !focused || settings.chromeHidden;
    $('#focus-title').textContent = focused ? titleFor(focused) : '';
}
// View-only transition: do not render/recreate any pane or chart here.
// The narrow RPC changes only the persistent presentation flag, never sampling,
// opacity, click-through, the split tree, or the native window's outer geometry.
let chromeRevision = 0;
function setChromeHidden(hidden) {
    if (!initialized) return;
    const before = settings.chromeHidden, revision = ++chromeRevision;
    settings = { ...settings, chromeHidden: !!hidden };
    closeMenu();
    views.forEach(v => v.charts.forEach(c => c.leave()));
    const r0 = root.getBoundingClientRect();
    updateToolbar(); resizeWorkspace();
    // The native frame grows/shrinks by exactly the bars, so the split layout keeps its
    // size and screen position and no chart is resized (skipped natively when maximized).
    const r1 = root.getBoundingClientRect();
    const adjust = { x: r0.left - r1.left, y: r0.top - r1.top, width: r0.width - r1.width, height: r0.height - r1.height };
    workspace.focus({ preventScroll: true });
    markDirty();
    bridge.call('window.chrome', { hidden: settings.chromeHidden, adjust }).catch(error => {
        if (revision === chromeRevision) {
            settings = { ...settings, chromeHidden: before };
            updateToolbar(); resizeWorkspace(); queueSession();
        }
        report(error);
    });
}
function toggleChrome() { setChromeHidden(!settings.chromeHidden); }
async function toggleCompression() { await applySettings({ ...settings, timeCompression: !settings.timeCompression }); markDirty(); }
function mutate(fn) {
    if (settings.layoutLocked) {
        toast('Unlock the layout before editing panes.');
        return;
    }
    undo.push(current.layout);
    try {
        const next = fn(clone(current.layout));
        validateLayout(next);
        current.layout = next;
    }
    catch (e) {
        undo.undoItems.pop();
        throw e;
    }
    if (!find(current.layout, selected))
        selected = leaves(current.layout)[0].id;
    focused = null;
    markDirty();
    render();
}
function doSplit(id, axis) { mutate(tree => { const next = divide(tree, id, axis); const par = parent(next, id); selected = par.b.id; return next; }); }
function assignWidget(id, w) { mutate(tree => { const n = find(tree, id); if (!n || n.kind !== 'leaf')
    throw new Error('This pane no longer exists.'); n.widget = safeWidget(w); return tree; }); }
function selectPane(id) { selected = id; $$('.pane', root).forEach(e => e.classList.toggle('selected', e.dataset.pane === id)); }
function focusPane(id) { focused = focused === id ? null : id; selected = id; render(); }
function render() {
    applyTimeView();
    for (const v of views)
        v.destroy();
    views = [];
    const display = focused ? find(current.layout, focused) : current.layout;
    if (!display) {
        focused = null;
        return render();
    }
    root.replaceChildren(renderNode(display));
    updateToolbar();
    resizeWorkspace();
    scheduleDraw(true);
    subscribe();
}
function renderNode(n) {
    if (n.kind === 'split') {
        const el = document.createElement('div');
        el.className = 'split-node';
        el.dataset.split = n.id;
        const amin = minSize(n.a), bmin = minSize(n.b);
        const a = document.createElement('div'), b = document.createElement('div');
        a.className = b.className = 'split-child';
        a.append(renderNode(n.a));
        b.append(renderNode(n.b));
        const gutter = document.createElement('div');
        gutter.className = `splitter ${n.axis}`;
        gutter.tabIndex = settings.layoutLocked ? -1 : 0;
        gutter.setAttribute('role', 'separator');
        gutter.setAttribute('aria-orientation', n.axis === 'x' ? 'vertical' : 'horizontal');
        gutter.setAttribute('aria-label', 'Resize split');
        gutter.setAttribute('aria-valuemin', '2');
        gutter.setAttribute('aria-valuemax', '98');
        gutter.setAttribute('aria-valuenow', String(Math.round(n.ratio * 100)));
        gutter.title = 'Drag to resize · Double-click to equalize · Arrow keys to adjust';
        // Use weights >1fr: sub-unit flex factors can leave unused track space
        // when a sibling hits its minimum. This preserves ratios but fills the pane.
        function applyRatio() { if (n.axis === 'x') {
            el.style.gridTemplateColumns = `minmax(${amin.width}px,${n.ratio * 100}fr) ${GUTTER}px minmax(${bmin.width}px,${(1 - n.ratio) * 100}fr)`;
            el.style.gridTemplateRows = 'minmax(0,1fr)';
        }
        else {
            el.style.gridTemplateRows = `minmax(${amin.height}px,${n.ratio * 100}fr) ${GUTTER}px minmax(${bmin.height}px,${(1 - n.ratio) * 100}fr)`;
            el.style.gridTemplateColumns = 'minmax(0,1fr)';
        } gutter.setAttribute('aria-valuenow', String(Math.round(n.ratio * 100))); }
        applyRatio();
        el.append(a, gutter, b);
        gutter.addEventListener('pointerdown', e => {
            if (settings.layoutLocked || e.button !== 0)
                return;
            e.preventDefault();
            e.stopPropagation();
            const before = clone(current.layout), r = el.getBoundingClientRect();
            const length = (n.axis === 'x' ? r.width : r.height) - GUTTER;
            const minA = n.axis === 'x' ? amin.width : amin.height, minB = n.axis === 'x' ? bmin.width : bmin.height;
            gutter.setPointerCapture(e.pointerId);
            gutter.classList.add('dragging');
            document.body.classList.add('resize-active');
            const move = ev => { const p = (n.axis === 'x' ? ev.clientX - r.left : ev.clientY - r.top) - GUTTER / 2; const lo = Math.max(.02, Math.min(.98, minA / length)), hi = Math.min(.98, Math.max(.02, 1 - minB / length)); n.ratio = lo <= hi ? clamp(p / length, lo, hi) : .5; applyRatio(); };
            const done = () => { gutter.removeEventListener('pointermove', move); gutter.removeEventListener('pointerup', done); gutter.removeEventListener('pointercancel', done); gutter.classList.remove('dragging'); document.body.classList.remove('resize-active'); undo.push(before); markDirty(); };
            gutter.addEventListener('pointermove', move);
            gutter.addEventListener('pointerup', done, { once: true });
            gutter.addEventListener('pointercancel', done, { once: true });
        });
        gutter.addEventListener('dblclick', () => mutate(tree => { find(tree, n.id).ratio = .5; return tree; }));
        gutter.addEventListener('keydown', e => { if (settings.layoutLocked)
            return; const step = e.shiftKey ? .1 : .02; if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            mutate(tree => { const s = find(tree, n.id); s.ratio = clamp(s.ratio + (['ArrowLeft', 'ArrowUp'].includes(e.key) ? -step : step), .02, .98); return tree; });
        } });
        return el;
    }
    const pane = document.createElement('section');
    pane.className = `pane${selected === n.id ? ' selected' : ''}${focused === n.id ? ' focused' : ''}`;
    pane.dataset.pane = n.id;
    const w = n.widget && safeWidget(n.widget), d = w ? catalog.get(w.metric) : null, title = w ? widgetTitle(w, catalog) : 'Empty pane';
    pane.setAttribute('aria-label', title);
    const device = w?.type === 'cores' ? `${system.physicalCores || '—'} cores / ${system.logicalProcessors || '—'} threads` : w?.type === 'comparison' ? 'MULTI-SERIES' : d?.device || '';
    pane.innerHTML = `<div class="pane-header"><span class="pane-icon" style="color:${w ? themeColor(d?.color || 'cpu') : 'var(--faint)'}">${icon(w ? widgetIcon(w, catalog) : 'plus')}</span><span class="pane-title" title="${esc(title)} · Double-click to focus">${esc(title)}</span><span class="pane-device" title="${esc(device)}">${esc(device)}</span><div class="pane-tools"><button class="pane-grip" title="Drag to exchange widgets" aria-label="Move widget">${icon('grip')}</button></div>${w?.type === 'cores' ? `<span class="grid-size" title="Chart columns · empty = automatic · rows follow"><button data-step="-1" aria-label="Fewer columns">−</button><input data-grid="coreColumns" type="number" min="1" max="32" placeholder="auto" aria-label="Columns" value="${w.coreColumns || ''}"><button data-step="1" aria-label="More columns">+</button></span>` : ''}</div><div class="pane-content"></div>`;
    pane.addEventListener('pointerdown', () => selectPane(n.id));
    $('.pane-title', pane).addEventListener('dblclick', () => focusPane(n.id));
    pane.addEventListener('contextmenu', e => { e.preventDefault(); paneMenu(n.id, e.clientX, e.clientY); });
    $('.pane-grip', pane).addEventListener('pointerdown', e => startSwap(e, n.id));
    if (settings.layoutLocked)
        $('.pane-grip', pane).disabled = true;
    const columns = $('[data-grid]', pane);
    if (columns) {
        const setColumns = value => mutate(t => { const leaf = find(t, n.id); leaf.widget = safeWidget({ ...leaf.widget, coreColumns: value }); return t; });
        // Stepping from automatic starts at the column count currently on screen.
        const shown = () => getComputedStyle($('.core-grid', pane) || pane).gridTemplateColumns.split(' ').length || 1;
        columns.addEventListener('change', withErrors(() => setColumns(Math.floor(+columns.value || 0))));
        $$('[data-step]', pane).forEach(b => b.addEventListener('click', withErrors(() => setColumns(clamp((+columns.value || shown()) + +b.dataset.step, 1, 32)))));
        $$('.grid-size input,.grid-size button', pane).forEach(el => el.disabled = settings.layoutLocked);
    }
    const content = $('.pane-content', pane);
    if (w) {
        const view = new WidgetView(content, w, store, catalog);
        view.sampleSeconds = settings.refreshSeconds;
        views.push(view);
        content.addEventListener('dblclick', e => { if (e.button === 0 && !e.altKey && settings.focusOnChartClick && !e.target.closest('button,input,select'))
            focusPane(n.id); });
    }
    else {
        content.innerHTML = `<div class="empty-pane"><span class="empty-mark">${icon('plus')}</span><button class="btn primary choose-widget">Choose a widget</button><p>One cell. Any metric.<br>Split it in either direction.</p><div class="empty-actions"><button class="empty-x" title="Left / right">${icon('splitX')}</button><button class="empty-y" title="Top / bottom">${icon('splitY')}</button></div></div>`;
        $('.choose-widget', content).onclick = () => showPicker(n.id);
        $('.empty-x', content).onclick = withErrors(() => doSplit(n.id, 'x'));
        $('.empty-y', content).onclick = withErrors(() => doSplit(n.id, 'y'));
    }
    return pane;
}
function startSwap(e, id) {
    if (settings.layoutLocked || e.button !== 0)
        return;
    e.preventDefault();
    e.stopPropagation();
    const source = e.currentTarget;
    source.setPointerCapture(e.pointerId);
    let ghost = null, target = null;
    const move = ev => { if (!ghost) {
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = 'Exchange · ' + titleFor(id);
        document.body.append(ghost);
    } ghost.style.left = `${ev.clientX + 12}px`; ghost.style.top = `${ev.clientY + 12}px`; $$('.drop-target').forEach(x => x.classList.remove('drop-target')); target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pane'); if (target && target.dataset.pane !== id)
        target.classList.add('drop-target'); };
    const done = () => { source.removeEventListener('pointermove', move); source.removeEventListener('pointerup', done); source.removeEventListener('pointercancel', cancel); ghost?.remove(); $$('.drop-target').forEach(x => x.classList.remove('drop-target')); if (target && target.dataset.pane !== id)
        mutate(t => swap(t, id, target.dataset.pane)); };
    const cancel = () => { target = null; done(); };
    source.addEventListener('pointermove', move);
    source.addEventListener('pointerup', done, { once: true });
    source.addEventListener('pointercancel', cancel, { once: true });
}
function resizeWorkspace() {
    const node = focused ? find(current.layout, focused) : current.layout;
    if (!node)
        return;
    const size = minSize(node), style = getComputedStyle(workspace);
    const px = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight), py = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const w = workspace.clientWidth - px, h = workspace.clientHeight - py;
    root.style.width = `${Math.max(w, size.width)}px`;
    root.style.height = `${Math.max(h, size.height)}px`;
    updateMinimum({ width: Math.max(settings.chromeHidden ? 180 : 380, size.width + px + 2), height: size.height + ($('#app').clientHeight - workspace.clientHeight) + py + 2 });
}
const updateMinimum = debounce(size => tryCall('window.minimum', size), 100);
new ResizeObserver(resizeWorkspace).observe(workspace);
function scheduleDraw(force = false) { if (redrawFrame)
    cancelAnimationFrame(redrawFrame); redrawFrame = requestAnimationFrame(() => { redrawFrame = 0; views.forEach(v => v.update(force)); }); }
const subscribe = debounce(() => {
    const interests = new Set();
    leaves(current.layout).forEach(n => { if (n.widget)
        requiredMetrics(n.widget, catalog).forEach(id => interests.add(id)); });
    store.retention = Math.max(settings.retentionSeconds, settings.historyNormal, settings.historyCompressed, ...leaves(current.layout).map(n => n.widget?.historySeconds || 0));
    tryCall('monitor.configure', { settings, metrics: [...interests] });
}, 100);
const queueSession = debounce(async () => {
    if (!initialized)
        return;
    const session = { ...current, settings, layout: current.layout, builtin: false };
    await tryCall('session.save', { session });
}, 600);
function applyTheme() {
    document.documentElement.dataset.theme = settings.theme;
    const custom = customThemes.find(t => t.id === settings.theme);
    $('#custom-theme').textContent = custom?.css || '';
    updateToolbar();
    scheduleDraw(true);
}
async function applySettings(next, { confirmClick = false } = {}) {
    next = cleanSettings(next);
    if (next.clickThrough && !settings.clickThrough) {
        if (!bridge.native) {
            toast('Click-through is a native Windows feature. Browser preview remains interactive.');
            next.clickThrough = false;
        }
        else if (!capabilities.recoveryHotkey || !capabilities.tray) {
            throw new Error('Click-through requires a working recovery hotkey and tray icon. Check Diagnostics.');
        }
        else if (confirmClick && !confirm('Enable click-through?\n\nThe entire window will ignore mouse input.\nPress Ctrl+Alt+Shift+F11, or choose Recover from the tray menu, to regain control.'))
            next.clickThrough = false;
    }
    const old = settings;
    settings = next;
    try {
        const r = await bridge.call('window.configure', { settings, allowClickThrough: settings.clickThrough });
        if (r?.settings)
            settings = cleanSettings({ ...settings, ...r.settings });
    }
    catch (e) {
        settings = old;
        throw e;
    }
    applyTimeView();
    applyTheme();
    render();
    queueSession();
}
function applyTimeView() { setTimeView({ compressed: settings.timeCompression, normal: settings.historyNormal, compressedSeconds: settings.historyCompressed, start: settings.compressStart, factor: settings.compressFactor }); }
function closeMenu() { $('#menu-root').replaceChildren(); }
function showMenu(items, x, y) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'context-menu';
    m.setAttribute('role', 'menu');
    for (const item of items) {
        if (item.separator) {
            m.append(document.createElement('hr'));
            continue;
        }
        if (item.label) {
            const l = document.createElement('div');
            l.className = 'menu-label';
            l.textContent = item.label;
            m.append(l);
            continue;
        }
        const b = document.createElement('button');
        b.setAttribute('role', 'menuitem');
        b.innerHTML = `${icon(item.icon || 'right')}<span>${esc(item.text)}</span>${item.key ? `<kbd>${esc(item.key)}</kbd>` : ''}`;
        b.disabled = !!item.disabled;
        if (item.active)
            b.classList.add('menu-preset-active');
        b.onclick = withErrors(() => { closeMenu(); return item.action(); });
        m.append(b);
    }
    $('#menu-root').append(m);
    const r = m.getBoundingClientRect();
    m.style.left = `${clamp(x - r.width + 20, 5, innerWidth - r.width - 5)}px`;
    m.style.top = `${clamp(y + 3, 5, innerHeight - r.height - 5)}px`;
    m.querySelector('button:not(:disabled)')?.focus();
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('.context-menu,#preset-button'))
    closeMenu(); });
/** Same size for every cell in this pane's row/column run; the rest of the tree is untouched. */
function equalize(id) {
    const top = groupRoot(current.layout, id), el = top && root.querySelector(`[data-split="${top.id}"]`);
    const r = el?.getBoundingClientRect();
    mutate(t => { equalizeGroup(t, id, r ? (top.axis === 'x' ? r.width : r.height) : 0); return t; });
}
function paneMenu(id, x, y) {
    selectPane(id);
    const n = find(current.layout, id), p = parent(current.layout, id), locked = settings.layoutLocked;
    showMenu([{ label: titleFor(id) },
        { text: settings.timeCompression ? 'Normal time axis' : 'Compressed time axis', icon: 'compress', action: toggleCompression },
        { text: settings.chromeHidden ? 'Show bars' : 'Charts only', icon: 'maximize', key: 'Mid click', action: toggleChrome },
        { text: 'Appearance / skins', icon: 'palette', action: showThemes },
        { text: focused === id ? 'Restore layout' : 'Focus this pane', icon: focused === id ? 'restore' : 'maximize', action: () => focusPane(id) },
        { text: 'Replace widget', icon: 'plus', disabled: locked, action: () => showPicker(id) },
        { text: 'Widget settings', icon: 'settings', disabled: !n?.widget || locked, action: () => showWidgetSettings(id) },
        { separator: true }, { text: 'Split left / right', icon: 'splitX', key: 'Ctrl Alt V', disabled: locked, action: () => doSplit(id, 'x') },
        { text: 'Split top / bottom', icon: 'splitY', key: 'Ctrl Alt H', disabled: locked, action: () => doSplit(id, 'y') },
        { text: 'Duplicate', icon: 'copy', disabled: locked || !n?.widget, action: () => mutate(t => divide(t, id, 'x', clone(n.widget))) },
        { text: 'Equalize sizes', icon: p?.axis === 'y' ? 'splitY' : 'splitX', disabled: locked || !p, action: () => equalize(id) },
        { text: 'Rotate parent split', icon: 'restore', disabled: locked || !p, action: () => mutate(t => { find(t, p.id).axis = p.axis === 'x' ? 'y' : 'x'; return t; }) },
        { separator: true }, { text: 'Clear widget', icon: 'minus', disabled: locked, action: () => mutate(t => { find(t, id).widget = null; return t; }) },
        { text: 'Remove cell', icon: 'trash', disabled: locked, action: () => mutate(t => remove(t, id)) },
        { separator: true }, { text: `About PulseView v${APP_VERSION}`, icon: 'keyboard', action: showHelp }], x, y);
}
function showModal(title, subtitle, body, footer = '', { floating = false } = {}) {
    closeMenu();
    if (modal.open)
        modal.close();
    modal.classList.toggle('floating', floating);
    modal.style.left = modal.style.top = modal.style.right = '';
    $('#modal-content').innerHTML = `<div class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
    $('.close-modal', modal).onclick = () => modal.close();
    // Persian/RTL names: each text field takes its direction from the first typed letter.
    $$('input:not([type]),input[type=text],input[type=search],textarea', modal).forEach(i => i.dir = 'auto');
    if (floating) modal.show(); else modal.showModal();
    $$('[data-close]', modal).forEach(b => b.onclick = () => modal.close());
}
// A floating (non-modal) dialog is dragged aside by its header so the workspace stays visible.
modal.addEventListener('pointerdown', e => {
    if (!modal.classList.contains('floating') || e.button !== 0 || !e.target.closest('.modal-header') || e.target.closest('button'))
        return;
    e.preventDefault();
    const r = modal.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = m => { modal.style.right = 'auto'; modal.style.left = `${clamp(m.clientX - dx, 0, innerWidth - r.width)}px`; modal.style.top = `${clamp(m.clientY - dy, 0, innerHeight - 40)}px`; };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
});
modal.addEventListener('click', e => { if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        modal.close();
} });
function showPicker(id = selected) {
    if (settings.layoutLocked) {
        toast('Unlock the layout to change a widget.');
        return;
    }
    const categories = ['All', 'CPU', 'Memory', 'GPU', 'NVIDIA', 'Network', 'Disk'];
    showModal('Widget library', `Assign to: ${titleFor(id)} · Splitting creates new cells; choosing here replaces only this cell.`, `<input class="picker-search" placeholder="Search metrics, devices or engine names…" aria-label="Search widgets"><div class="category-tabs">${categories.map((c, i) => `<button data-category="${c}" class="${i === 0 ? 'active' : ''}">${c}</button>`).join('')}</div><div class="widget-bundles">${WIDGET_TYPES.filter(t => t.type !== 'metric').map(t => `<button class="bundle-button" data-bundle="${t.type}">${icon(t.icon)}<b>${esc(t.name)}</b><small>${esc(t.description)}</small></button>`).join('')}</div><div class="metric-list"></div>`, `<span class="field-hint" style="margin-right:auto">Dimmed metrics are selectable, but unavailable readings show —, never fabricated zero.</span><button class="btn" data-close>Close</button>`);
    let category = 'All';
    function list() {
        const query = $('.picker-search', modal).value.toLowerCase();
        const matches = [...catalog.values()].filter(m => (category === 'All' || m.category === category) && `${m.label} ${m.id} ${m.device || ''} ${m.source || ''}`.toLowerCase().includes(query));
        $('.metric-list', modal).innerHTML = matches.map(m => `<button class="metric-item ${m.available ? '' : 'missing'}" data-metric="${esc(m.id)}" title="${esc(m.source)}${m.reason ? ' · ' + esc(m.reason) : ''}"><i style="color:${themeColor(m.color || 'cpu')}">${icon(({ CPU: 'cpu', Memory: 'memory', GPU: 'gpu', NVIDIA: 'gpu', Network: 'network', Disk: 'disk' })[m.category])}</i><span><strong>${esc(m.label)}</strong><small>${esc(m.device || m.category)} · ${esc(m.unit)}</small></span><i class="availability"></i></button>`).join('') || '<p class="muted">No matching metrics.</p>';
        $$('[data-metric]', modal).forEach(b => b.onclick = withErrors(() => { assignWidget(id, makeWidget(b.dataset.metric)); modal.close(); }));
    }
    $('.picker-search', modal).oninput = list;
    $$('[data-category]', modal).forEach(b => b.onclick = () => { category = b.dataset.category; $$('[data-category]', modal).forEach(x => x.classList.toggle('active', x === b)); list(); });
    $$('[data-bundle]', modal).forEach(b => b.onclick = withErrors(() => { assignWidget(id, makeWidget(b.dataset.bundle === 'network' ? 'net.download' : b.dataset.bundle === 'disk' ? 'disk.read' : 'cpu.usage', b.dataset.bundle)); modal.close(); }));
    list();
    $('.picker-search', modal).focus();
}
function showWidgetSettings(id) {
    const n = find(current.layout, id);
    if (!n?.widget)
        return;
    const w = safeWidget(n.widget);
    const options = (values, currentValue) => values.map(([v, t]) => `<option value="${esc(v)}" ${v === currentValue ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const colorKeys = ['auto', 'gpu', 'vram', 'cpu', 'ram', 'net', 'upload', 'copy'];
    showModal('Widget settings', titleFor(id), `<form id="widget-form" class="form-grid">
 <label class="full">Custom title<input name="title" maxlength="100" value="${esc(w.title)}" placeholder="Automatic metric name"></label>
 <label>Visualization<select name="chart">${options([['area', 'Gradient area'], ['line', 'Line'], ['bars', 'Bars'], ['meter', 'Meter + line'], ['number', 'Number only']], w.chart)}</select></label>
 <label>History (seconds · 0 = app setting)<input name="historySeconds" type="number" min="0" max="3600" value="${w.historySeconds}"></label>
 <label>Color token<select name="color">${options(colorKeys.map(c => [c, c === 'auto' ? 'Automatic / theme' : c.toUpperCase()]), w.color)}</select></label>
 <label>Unit display<select name="unit">${options([['auto', 'Automatic · bytes (KB/s, MB/s…)'], ['bits', 'Bits (Kbps, Mbps…)'], ['GiB', 'GiB (memory)'], ['Mbps', 'Mbps (network)'], ['MB/s', 'MB/s (I/O)'], ['MHz', 'MHz (clock)']], w.unit)}</select></label>
 <label>Line color override<input name="lineColor" value="${esc(w.lineColor)}" placeholder="#ed30d4 · blank = theme" pattern="#[0-9a-fA-F]{6}|^$"></label>
 <label>Gradient lower color<input name="gradientColor" value="${esc(w.gradientColor)}" placeholder="#5b2fb3 · blank = theme" pattern="#[0-9a-fA-F]{6}|^$"></label>
 <label>Line width<input name="lineWidth" type="number" min="0.5" max="4" step="0.1" value="${w.lineWidth}"></label>
 <label>Gradient fill opacity<input name="fillOpacity" type="number" min="0" max="0.8" step="0.01" value="${w.fillOpacity}"></label>
 <label>Vertical scale<select name="scale">${options([['auto', 'Automatic / metric capacity'], ['fixed', 'Fixed range']], w.scale)}</select></label>
 <label>Display update (seconds)<input name="displaySeconds" type="number" min="0" max="60" step="0.25" value="${w.displaySeconds}"><small class="field-hint">0 = every sample. Does not create faster measurements.</small></label>
 <label>Fixed minimum<input name="fixedMin" type="number" step="any" value="${w.fixedMin}"></label><label>Fixed maximum<input name="fixedMax" type="number" step="any" value="${w.fixedMax}"><small class="field-hint">Native base units: bytes, bytes/sec, MHz, %.</small></label>
 ${w.type === 'cores' ? `<label class="full">Chart columns (0 = automatic · rows follow)<input name="coreColumns" type="number" min="0" max="32" value="${w.coreColumns}"></label>` : ''}
 ${['comparison', 'network', 'disk'].includes(w.type) ? `<label class="full">Chart series ${w.type === 'comparison' ? '(up to 12)' : '(first 2 are used)'}<select name="metrics" multiple class="series-select">${[...catalog.values()].map(m => `<option value="${esc(m.id)}" ${(w.metrics.length ? w.metrics : w.type === 'network' ? ['net.download', 'net.upload'] : ['disk.read', 'disk.write']).includes(m.id) ? 'selected' : ''}>${esc(m.label)} · ${esc(m.device || m.category)}</option>`).join('')}</select><small class="field-hint">Ctrl+click to select several. Different units are explicitly normalized.</small></label>` : ''}
 <div class="full">${[['grid', 'Show grid'], ['axes', 'Show axes'], ['stats', 'Show statistics footer'], ...(w.type === 'comparison' ? [['legend', 'Show series legend'], ['normalized', 'Normalize series to 0–100%']] : [])].map(([key, title]) => `<div class="toggle-row"><label for="w-${key}">${title}</label><input id="w-${key}" name="${key}" type="checkbox" ${w[key] ? 'checked' : ''}></div>`).join('')}</div>
 </form>`, `<button id="reset-chart-style" class="btn">Use skin chart style</button><div class="title-spacer"></div><span id="widget-error" class="form-error"></span><button class="btn" data-close>Cancel</button><button id="apply-widget" class="btn primary">Apply</button>`);
    $('#reset-chart-style', modal).onclick = () => {
        const f = $('#widget-form', modal);
        for (const [key, value] of Object.entries({ color: 'auto', lineColor: '', gradientColor: '', lineWidth: 1.5, fillOpacity: DEFAULT_FILL_OPACITY })) f.elements.namedItem(key).value = String(value);
    };
    $('#apply-widget', modal).onclick = withErrors(() => {
        const f = $('#widget-form', modal);
        if (!f.reportValidity())
            return;
        const data = new FormData(f);
        const next = { ...w };
        for (const key of ['title', 'chart', 'color', 'unit', 'scale', 'lineColor', 'gradientColor'])
            next[key] = String(data.get(key) || '');
        for (const [key, lo, hi, def] of [['historySeconds', 0, 3600, 0], ['lineWidth', .5, 4, 1.5], ['fillOpacity', 0, .8, DEFAULT_FILL_OPACITY], ['displaySeconds', 0, 60, 0], ['fixedMin', -1e15, 1e15, 0], ['fixedMax', -1e15, 1e15, 100], ['coreColumns', 0, 32, 0]])
            next[key] = fieldNumber(f, key, lo, hi, def);
        for (const key of ['grid', 'axes', 'stats', ...(w.type === 'comparison' ? ['legend'] : [])])
            next[key] = data.has(key);
        if (w.type === 'comparison')
            next.normalized = data.has('normalized');
        if (['comparison', 'network', 'disk'].includes(w.type)) {
            next.metrics = data.getAll('metrics');
            if (!next.metrics.length)
                throw new Error('Select at least one series.');
            if (w.type !== 'comparison' && next.metrics.length < 2)
                throw new Error('Select two series for this widget.');
        }
        if (next.scale === 'fixed' && next.fixedMax <= next.fixedMin)
            throw new Error('Fixed maximum must be greater than minimum.');
        assignWidget(id, next);
        modal.close();
    });
}
function miniature(n) {
    if (n.kind === 'leaf') {
        const e = document.createElement('div');
        e.className = 'mini-leaf';
        if (n.widget)
            e.style.setProperty('--mini-color', themeColor(catalog.get(n.widget.metric)?.color || 'cpu'));
        return e;
    }
    const e = document.createElement('div');
    e.className = 'mini-split';
    e.style.flexDirection = n.axis === 'x' ? 'row' : 'column';
    for (const [child, ratio] of [[n.a, n.ratio], [n.b, 1 - n.ratio]]) {
        const c = document.createElement('div');
        c.style.cssText = `flex:${ratio};min-width:0;min-height:0;`;
        c.append(miniature(child));
        e.append(c);
    }
    return e;
}
async function loadPreset(p) {
    if (transitioning)
        return;
    validatePreset(p);
    if (dirty && !confirm('Switch layouts?\n\nChanges to this preset have not been saved. Choose Cancel and Save first to keep them.'))
        return;
    transitioning = true;
    try {
        const next = clone(p);
        leaves(next.layout).forEach(n => { if (n.widget)
            n.widget = safeWidget(n.widget); });
        let ns = cleanSettings(next.settings);
        if (ns.clickThrough && !settings.clickThrough && !confirm('This preset enables click-through.\nCtrl+Alt+Shift+F11 restores input.\nEnable click-through now?'))
            ns.clickThrough = false;
        current = next;
        selected = leaves(next.layout)[0].id;
        focused = null;
        dirty = false;
        undo.clear();
        await applySettings(ns);
        if (settings.restoreWindow && next.window)
            await bridge.call('window.apply', { window: { width: next.window.width, height: next.window.height, maximized: !!next.window.maximized } });
        render();
        queueSession();
        if (modal.open)
            modal.close();
        toast(`Loaded ${p.name}${bridge.native ? '' : ' · preview cannot resize a browser window'}`);
    }
    finally {
        transitioning = false;
    }
}
async function showPresets() {
    const latest = await tryCall('presets.list');
    if (latest)
        userPresets = latest;
    const all = [...builtinPresets, ...userPresets];
    showModal('Your workspaces', 'Presets remember the entire split tree, widget settings, theme and window size.', `<div class="preset-grid">${all.map(p => `<article class="preset-card" data-preset="${esc(p.id)}"><div class="layout-mini"></div><h3>${esc(p.name)}</h3><p>${esc(p.description || 'Saved on disk · custom layout')}</p><span class="preset-meta">${leaves(p.layout).length} panes · ${p.window?.width || '—'} × ${p.window?.height || '—'} DIP ${p.builtin ? '· built-in' : ''}</span><div class="preset-card-actions"><button class="btn primary preset-load">Load</button><button class="icon-button preset-export" title="Export preset">${icon('export')}</button>${p.builtin ? '' : `<button class="icon-button preset-delete" title="Delete saved preset">${icon('trash')}</button>`}</div></article>`).join('')}</div>`, `<button id="preset-import" class="btn">${icon('import')} Import JSON</button><button id="open-presets-folder" class="btn">${icon('folder')} Preset folder</button><div class="title-spacer"></div><button id="new-layout" class="btn">New empty layout</button><button class="btn" data-close>Close</button>`);
    $$('.preset-card', modal).forEach(card => { const p = all.find(p => p.id === card.dataset.preset); $('.layout-mini', card).append(miniature(p.layout)); $('.layout-mini', card).onclick = $('.preset-load', card).onclick = withErrors(() => loadPreset(p)); $('.preset-export', card).onclick = () => exportPreset(p); const del = $('.preset-delete', card); if (del)
        del.onclick = withErrors(async () => { if (confirm(`Delete saved preset “${p.name}”?`)) {
            await bridge.call('presets.delete', { id: p.id });
            await showPresets();
        } }); });
    $('#preset-import', modal).onclick = () => importPreset();
    $('#open-presets-folder', modal).onclick = () => tryCall('app.openFolder', { folder: 'presets' });
    $('#new-layout', modal).onclick = withErrors(() => loadPreset({ ...firstSession(), name: 'Unsaved layout', layout: leaf() }));
}
function presetMenu() {
    const r = $('#preset-button').getBoundingClientRect();
    showMenu([
        { label: 'Built-in layouts' }, ...builtinPresets.map(p => ({ text: p.name, icon: 'grid', active: current.id === p.id, action: () => loadPreset(p) })),
        ...(userPresets.length ? [{ separator: true }, { label: 'Saved on disk' }, ...userPresets.slice(0, 9).map(p => ({ text: p.name, icon: 'save', active: current.id === p.id, action: () => loadPreset(p) }))] : []),
        { separator: true }, { text: 'Manage / import presets', icon: 'folder', action: showPresets }, { text: 'Save current layout', icon: 'save', key: 'Ctrl S', action: () => showSave() }
    ], r.right, r.bottom);
}
function showSave() {
    const existing = !current.builtin && current.id !== 'session' && userPresets.some(x => x.id === current.id);
    showModal('Save workspace', 'Named presets are not overwritten by ordinary layout edits. Save explicitly to update one.', `<form id="save-form" class="form-grid"><label class="full">Preset name<input name="name" maxlength="100" required value="${esc(existing ? current.name : current.builtin ? current.name + ' · Custom' : 'My workspace')}"></label><label class="full">Description<input name="description" maxlength="250" value="${esc(current.description || '')}" placeholder="When do you use this layout?"></label>${existing ? '<div class="toggle-row full"><label for="save-copy">Save as a new copy</label><input id="save-copy" name="copy" type="checkbox"></div>' : ''}<div class="settings-note full">The window size (not its position), split ratios, selected widgets and appearance settings will be captured. Live chart samples are not part of a preset.</div></form>`, `<span id="save-error" class="form-error"></span><button class="btn" data-close>Cancel</button><button id="confirm-save" class="btn primary">Save to disk</button>`);
    const input = $('input[name=name]', modal);
    input.focus();
    input.select();
    async function save() {
        const form = $('#save-form', modal);
        if (!form.reportValidity())
            return;
        const data = new FormData(form);
        const name = String(data.get('name')).trim();
        if (!name)
            return;
        const button = $('#confirm-save', modal);
        button.disabled = true;
        try {
            // Presets carry the window size only; loading one never moves the window.
            const { width, height, maximized } = await bridge.call('window.state');
            const now = new Date().toISOString();
            const preset = { schemaVersion: 1, id: existing && !data.has('copy') ? current.id : uid(), name, description: String(data.get('description') || ''), layout: clone(current.layout), settings: { ...settings }, window: { width, height, maximized }, createdAt: current.createdAt || now, modifiedAt: now };
            const saved = await bridge.call('presets.save', { preset });
            current = { ...preset, ...saved, builtin: false };
            userPresets = await bridge.call('presets.list');
            dirty = false;
            updateToolbar();
            queueSession();
            modal.close();
            toast(bridge.native ? 'Preset saved on disk.' : 'Saved in browser demo storage. Desktop presets are real JSON files.');
        }
        catch (e) {
            $('#save-error', modal).textContent = e.message;
            button.disabled = false;
        }
    }
    $('#confirm-save', modal).onclick = save;
    $('#save-form', modal).onsubmit = e => { e.preventDefault(); save(); };
}
async function exportPreset(p) {
    if (bridge.native) {
        await tryCall('presets.export', { preset: p });
        return;
    }
    downloadJson(`${p.name.replace(/[^\w -]/g, '_') || 'workspace'}.json`, p);
}
function chooseFile(accept, fn) { const input = document.createElement('input'); input.type = 'file'; input.accept = accept; input.addEventListener('change', withErrors(async () => { if (input.files?.[0])
    await fn(input.files[0]); })); input.click(); }
function importPreset() { chooseFile('.json,application/json', async (file) => { if (file.size > 4 * 1024 * 1024)
    throw new Error('Preset exceeds the 4 MiB limit.'); const p = JSON.parse(await file.text()); validatePreset(p); p.id = uid(); p.builtin = false; p.settings = cleanSettings(p.settings); leaves(p.layout).forEach(n => { if (n.widget)
    n.widget = safeWidget(n.widget); }); await bridge.call('presets.save', { preset: p, preserveWindow: true }); userPresets = await bridge.call('presets.list'); await showPresets(); toast('Imported preset.'); }); }
function themeCard(t) {
    const p = t.swatches || ['#162035', '#d660ce', '#fab754', '#80dedd'];
    return `<button class="theme-card ${settings.theme === t.id ? 'active' : ''}" data-theme-id="${esc(t.id)}"><div class="theme-preview" style="background:${p[0]}">${p.slice(1).map(c => `<i style="color:${c}"></i>`).join('')}</div><b>${esc(t.name)}</b><small>${esc(t.description || 'Custom CSS skin')}</small></button>`;
}
async function showThemes() {
    const ts = await tryCall('themes.list');
    if (ts)
        customThemes = ts;
    showModal('Appearance', 'Drag this window aside to preview skins live.', `<div class="themes-grid">${[...BUILTIN_THEMES, ...customThemes].map(themeCard).join('')}</div><div class="theme-file-row"><button id="import-theme" class="btn">${icon('import')} Install CSS theme</button><button id="open-theme-folder" class="btn">${icon('folder')} Theme folder</button><button id="refresh-themes" class="btn">Reload themes</button></div><div class="settings-note">Create a <b>.css</b> file in the theme folder, then reload. Use <b>:root { --bg: …; --gpu: …; --vram: …; --cpu: …; }</b>. Custom themes inherit missing Midnight tokens. Only install CSS from sources you trust.</div>`, `<button class="btn" data-close>Done</button>`, { floating: true });
    $$('[data-theme-id]', modal).forEach(b => b.onclick = withErrors(async () => { await applySettings({ ...settings, theme: b.dataset.themeId }); markDirty(); $$('[data-theme-id]', modal).forEach(x => x.classList.toggle('active', x === b)); }));
    $('#open-theme-folder', modal).onclick = () => tryCall('app.openFolder', { folder: 'themes' });
    $('#refresh-themes', modal).onclick = withErrors(showThemes);
    $('#import-theme', modal).onclick = () => chooseFile('.css,text/css', async (file) => { if (file.size > 256 * 1024)
        throw new Error('Theme exceeds the 256 KiB limit.'); const css = await file.text(), name = css.match(/@name\s+([^\r\n*]+)/)?.[1]?.trim() || file.name.replace(/\.css$/i, ''); const id = 'custom-' + file.name.replace(/\.css$/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 55); await bridge.call('themes.install', { id, name, css }); await showThemes(); toast('CSS theme installed.'); });
}
function toggleRow(key, title, note) { return `<div class="toggle-row"><label for="s-${key}">${title}<small>${note}</small></label><input id="s-${key}" name="${key}" type="checkbox" ${settings[key] ? 'checked' : ''}></div>`; }
function showSettings() {
    showModal('Workspace settings', 'These settings are stored with each preset.', `<form id="settings-form"><h3 class="section-heading">Sampling</h3><div class="form-grid"><label>Refresh interval (seconds)<input type="number" name="refreshSeconds" min="0.25" max="60" step="0.25" value="${settings.refreshSeconds}"><small class="field-hint">1 second recommended. Faster sampling can cost more CPU.</small></label><label>In-memory history (seconds)<input type="number" name="retentionSeconds" min="60" max="3600" value="${settings.retentionSeconds}"><small class="field-hint">Expanded automatically for longer widget histories.</small></label></div>
 ${toggleRow('pauseWhenMinimized', 'Pause while minimized', 'Saves work. Resuming creates a gap, not invented samples.')}
 <h3 class="section-heading">Time axis</h3>${toggleRow('timeCompression', 'Compressed time axis', 'Recent samples keep normal spacing; older ones are packed progressively toward the left edge.')}
 <div class="form-grid"><label>Normal history (seconds)<input type="number" name="historyNormal" min="15" max="3600" value="${settings.historyNormal}"></label><label>Compressed history (seconds)<input type="number" name="historyCompressed" min="15" max="3600" value="${settings.historyCompressed}"></label>
 <label>Compression starts at (% from right)<input type="number" name="compressStartPct" min="0" max="90" step="1" value="${Math.round(settings.compressStart * 100)}"></label><label>Compression at left edge (×)<input type="number" name="compressFactor" min="1" max="16" step="0.5" value="${settings.compressFactor}"></label>
 <small class="field-hint full">Widgets with their own history keep it in both modes.</small></div>
 <h3 class="section-heading">Window</h3>${toggleRow('alwaysOnTop', 'Always on top', 'Keep the monitor above ordinary desktop windows.')}
 <div class="toggle-row"><label for="s-opacity">Window opacity <small>Whole composition, including charts and text. 25–100%.</small></label><div class="input-with-suffix"><input style="width:130px" id="s-opacity" name="opacity" type="range" min="0.25" max="1" step="0.01" value="${settings.opacity}"><output id="opacity-value">${Math.round(settings.opacity * 100)}%</output></div></div>
 ${toggleRow('clickThrough', 'Click-through overlay', 'Mouse input passes to applications below. Recovery: Ctrl+Alt+Shift+F11.')}
 ${toggleRow('restoreWindow', 'Restore window with presets', 'Restore size, monitor-relative position and maximized state.')}
 ${toggleRow('minimizeToTray', 'Minimize to tray', 'Use the tray icon to show the window again.')}
 ${toggleRow('closeToTray', 'Close button hides to tray', 'Use Exit in the tray menu to actually quit.')}
 <h3 class="section-heading">Workspace</h3>${toggleRow('layoutLocked', 'Lock split layout', 'Prevent accidental splits, swaps and splitter drags.')}
 ${toggleRow('focusOnChartClick', 'Double-click chart to focus / restore', 'The split tree is preserved while one chart fills the workspace.')}
 ${toggleRow('compact', 'Compact spacing', 'Small headers, narrow gutters and reduced internal padding.')}
 ${toggleRow('chromeHidden', 'Charts-only mode', 'Hide title bar, toolbar, focus bar and footer. Middle-click any chart or Ctrl+Shift+C to toggle; Esc restores bars.')}
 <div class="settings-note warning">Click-through is enabled only when both the recovery hotkey and the tray icon are available. Restart always restores mouse input. A very small window never discards a pane: minimum sizes apply; scrolling is the fallback when the layout cannot fit a display.</div>
 ${!bridge.native ? '<div class="settings-note">Browser preview: sampling and UI settings work on simulated data. Native opacity, topmost, click-through and window geometry require the Windows executable.</div>' : ''}
 </form>`, `<button id="diagnostics-button" class="btn">Diagnostics</button><div class="title-spacer"></div><span id="settings-error" class="form-error"></span><button class="btn" data-close>Cancel</button><button id="apply-settings" class="btn primary">Apply settings</button>`);
    $('#s-opacity', modal).oninput = e => $('#opacity-value', modal).textContent = `${Math.round(+e.target.value * 100)}%`;
    $('#apply-settings', modal).onclick = async () => {
        const form = $('#settings-form', modal);
        if (!form.reportValidity())
            return;
        const fd = new FormData(form), next = { ...settings };
        for (const key of Object.keys(DEFAULT_SETTINGS))
            if (typeof DEFAULT_SETTINGS[key] === 'boolean')
                next[key] = fd.has(key);
        next.refreshSeconds = fieldNumber(form, 'refreshSeconds', .25, 60, 1);
        next.retentionSeconds = fieldNumber(form, 'retentionSeconds', 60, 3600, 600);
        next.opacity = fieldNumber(form, 'opacity', .25, 1, 1);
        next.historyNormal = fieldNumber(form, 'historyNormal', 15, 3600, 120);
        next.historyCompressed = fieldNumber(form, 'historyCompressed', 15, 3600, 600);
        next.compressStart = fieldNumber(form, 'compressStartPct', 0, 90, 25) / 100;
        next.compressFactor = fieldNumber(form, 'compressFactor', 1, 16, 4);
        try {
            await applySettings(next, { confirmClick: true });
            markDirty();
            modal.close();
        }
        catch (e) {
            $('#settings-error', modal).textContent = e.message;
        }
    };
    $('#diagnostics-button', modal).onclick = withErrors(showDiagnostics);
}
async function showDiagnostics() { const d = await bridge.call('app.diagnostics'); showModal('Diagnostics', 'Read-only details. Unsupported metrics remain unavailable instead of being guessed.', `<pre class="diagnostics">${esc(JSON.stringify(d, null, 2))}</pre>`, `<button id="diagnostic-log-folder" class="btn">Open data folder</button><button class="btn" data-close>Close</button>`); $('#diagnostic-log-folder', modal).onclick = () => tryCall('app.openFolder', { folder: 'data' }); }
function showHelp() { showModal('About PulseView', 'Version ' + APP_VERSION + ' · Windows performance workspace', `<p id="about-version" class="help-copy"><b>PulseView ${esc(APP_VERSION)}</b></p><p class="help-copy">Start with one cell. Right-click it to split left/right or top/bottom, then assign any metric. Split either child again to form irregular rows and columns. Drag a divider to resize. Drag the six-dot handle onto another pane to exchange their widgets. Double-click a chart to focus it; double-click again to restore. Drag a chart or the title bar to move the window. Middle-click any chart to hide all application bars; middle-click again to bring them back. Pane headers remain for identification; splitter geometry is unchanged. Hovering a chart marks the nearest recorded sample and shows its value next to it; the point stays put until the mouse moves again. Named presets only change when you explicitly save.</p><h3 class="section-heading">Keyboard</h3><div class="shortcut-list">${[['Charts-only mode / application bars', 'Middle click / Ctrl Shift C'], ['Widget library', 'Ctrl K'], ['Save preset', 'Ctrl S'], ['Split left / right', 'Ctrl Alt V'], ['Split top / bottom', 'Ctrl Alt H'], ['Undo / redo layout', 'Ctrl Z / Ctrl Y'], ['Focus selected pane', 'Enter'], ['Restore focus / close dialog', 'Esc'], ['Pause / resume sampling', 'Space'], ['Recover overlay input (global)', 'Ctrl Alt Shift F11'], ['Saved preset 1–9 (global, if available)', 'Ctrl Alt Shift 1–9']].map(([a, b]) => `<span>${esc(a)}</span><kbd>${esc(b)}</kbd>`).join('')}</div><h3 class="section-heading">Your files</h3><p class="help-copy">${esc(dataPath)}<br>Native presets are UTF-8 JSON files under <b>presets</b>. Themes live under <b>themes</b>. The session draft is separate from named presets. The app does not persist telemetry history.</p>`, `<button id="help-presets" class="btn">Manage presets</button><button class="btn" data-close>Close</button>`); $('#help-presets', modal).onclick = withErrors(showPresets); }
// Global controls.
$('#preset-button').onclick = presetMenu;
$('#save-button').onclick = showSave;
$('#add-button').onclick = () => showPicker();
$('#theme-button').onclick = withErrors(showThemes);
$('#settings-button').onclick = showSettings;
$('#help-button').onclick = showHelp;
$('#split-x-button').onclick = withErrors(() => doSplit(selected, 'x'));
$('#split-y-button').onclick = withErrors(() => doSplit(selected, 'y'));
$('#undo-button').onclick = () => { if (settings.layoutLocked)
    return; current.layout = undo.undo(current.layout); focused = null; markDirty(); render(); };
$('#redo-button').onclick = () => { if (settings.layoutLocked)
    return; current.layout = undo.redo(current.layout); focused = null; markDirty(); render(); };
$('#lock-button').onclick = withErrors(async () => { await applySettings({ ...settings, layoutLocked: !settings.layoutLocked }); markDirty(); });
$('#chrome-button').onclick = toggleChrome;
$('#compress-button').onclick = withErrors(toggleCompression);
$('#pin-button').onclick = withErrors(async () => { await applySettings({ ...settings, alwaysOnTop: !settings.alwaysOnTop }); markDirty(); if (!bridge.native)
    toast('Always-on-top is applied by the native Windows host.'); });
async function togglePause() { const r = await bridge.call('monitor.pause', { paused: !paused }); paused = r.paused; updateToolbar(); updateStatus(); }
$('#pause-button').onclick = withErrors(togglePause);
$('#refresh-select').onchange = withErrors(async (e) => { await applySettings({ ...settings, refreshSeconds: +e.target.value }); markDirty(); });
$('#restore-focus').onclick = () => { focused = null; render(); };
$$('[data-window]').forEach(b => b.onclick = () => tryCall('window.command', { command: b.dataset.window }));
// Left-drag moves the native window only after a few pixels of travel, so single and
// double clicks on the same surface still arrive (the native move loop swallows them).
const INTERACTIVE = 'button,input,select,textarea,a,label';
function armWindowDrag(e) {
    if (e.button !== 0 || !bridge.native) return;
    const x = e.screenX, y = e.screenY;
    const stop = () => { removeEventListener('pointermove', move, true); removeEventListener('pointerup', stop, true); removeEventListener('pointercancel', stop, true); };
    const move = m => { if (Math.hypot(m.screenX - x, m.screenY - y) < 4) return; stop(); closeMenu(); tryCall('window.command', { command: 'drag' }); };
    addEventListener('pointermove', move, true); addEventListener('pointerup', stop, true); addEventListener('pointercancel', stop, true);
}
const titlebar = $('.titlebar');
titlebar.addEventListener('pointerdown', e => { if (!e.target.closest(INTERACTIVE)) armWindowDrag(e); });
titlebar.addEventListener('dblclick', e => { if (!e.target.closest(INTERACTIVE)) tryCall('window.command', { command: 'maximize' }); });
// Cancel middle-button autoscroll/paste on DOWN, but toggle exactly once on UP
// (auxclick). Reflowing on pointerdown would lose the matching click target.
const isChartSurface = e => e.target instanceof Element && e.target.closest('.pane') && !e.target.closest(INTERACTIVE);
for (const event of ['pointerdown', 'mousedown']) workspace.addEventListener(event, e => {
    if (e.button === 1 && isChartSurface(e)) e.preventDefault();
}, { capture: true });
workspace.addEventListener('auxclick', e => {
    if (e.button === 1 && isChartSurface(e)) { e.preventDefault(); e.stopPropagation(); toggleChrome(); }
});
workspace.addEventListener('pointerdown', e => { if (isChartSurface(e) && e.target.closest('.pane-content')) armWindowDrag(e); });
function updateStatus() {
    $('#connection-status').innerHTML = `<i class="status-dot${bridge.native ? '' : ' demo'}"></i>${bridge.native ? (paused ? 'Paused · native telemetry' : 'Live telemetry') : (paused ? 'DEMO · paused' : 'DEMO · simulated data')}`;
    $('#sample-status').textContent = `${settings.refreshSeconds} s sampling${store.lastTime ? ' · ' + new Date(store.lastTime).toLocaleTimeString([], { hour12: false }) : ''}`;
}
document.addEventListener('keydown', withErrors(async (e) => {
    const editing = e.target.closest('input,textarea,select,[contenteditable=true]');
    if (e.key === 'Escape') {
        closeMenu();
        if (modal.open) {
            modal.close();
            return;
        }
        if (settings.chromeHidden) { setChromeHidden(false); return; }
        if (focused) {
            focused = null;
            render();
        }
        return;
    }
    if (editing || modal.open)
        return;
    // Physical key, so shortcuts work on non-Latin layouts (Persian Ctrl+S reports key 'س').
    const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
    if (e.ctrlKey && e.shiftKey && letter === 'c') {
        e.preventDefault(); toggleChrome();
    }
    else if (e.ctrlKey && letter === 'k') {
        e.preventDefault();
        showPicker();
    }
    else if (e.ctrlKey && letter === 's') {
        e.preventDefault();
        showSave();
    }
    else if (e.ctrlKey && e.altKey && letter === 'v') {
        e.preventDefault();
        doSplit(selected, 'x');
    }
    else if (e.ctrlKey && e.altKey && letter === 'h') {
        e.preventDefault();
        doSplit(selected, 'y');
    }
    else if (e.ctrlKey && letter === 'z') {
        e.preventDefault();
        $('#undo-button').click();
    }
    else if (e.ctrlKey && letter === 'y') {
        e.preventDefault();
        $('#redo-button').click();
    }
    else if (e.key === 'Enter') {
        e.preventDefault();
        focusPane(selected);
    }
    else if (e.code === 'Space') {
        e.preventDefault();
        await togglePause();
    }
}));
document.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea'))
    e.preventDefault(); });
bridge.on('catalog', data => {
    if (!data?.metrics)
        return;
    system = data.system || system;
    // Do not rebuild views on every changing reading. Only descriptor/schema changes matter.
    const sig = JSON.stringify(data.metrics);
    for (const m of data.metrics)
        if (m && typeof m.id === 'string')
            catalog.set(m.id, { ...catalog.get(m.id), ...m });
    if (sig !== catalogSignature) {
        catalogSignature = sig;
        render();
    }
});
bridge.on('metrics', snapshot => { store.add(snapshot); scheduleDraw(); updateStatus(); });
bridge.on('nativeSettings', s => { settings = cleanSettings({ ...settings, ...s }); applyTheme(); render(); queueSession(); });
bridge.on('pause', s => { paused = !!s.paused; updateToolbar(); updateStatus(); });
bridge.on('presetHotkey', data => { const p = userPresets[data.index]; if (p)
    withErrors(() => loadPreset(p))();
else
    toast('No saved preset assigned to this slot.'); });
bridge.on('notice', d => toast(d.message, !!d.error));
bridge.on('windowChanged', () => queueSession());
bridge.on('saveRequested', () => queueSession());
window.addEventListener('beforeunload', () => { if (!bridge.native)
    bridge.write('session', { ...current, settings }); });
async function boot() {
    render();
    try {
        const ready = await bridge.call('app.ready');
        capabilities = ready.capabilities || {};
        dataPath = ready.dataPath || '';
        userPresets = ready.presets || [];
        customThemes = ready.themes || [];
        if (ready.session) {
            try {
                validatePreset(ready.session);
                current = ready.session;
                leaves(current.layout).forEach(n => { if (n.widget)
                    n.widget = safeWidget(n.widget); });
            }
            catch (e) {
                toast('Session draft could not be restored. Your named presets are unchanged.', true);
            }
        }
        const requested = new URLSearchParams(location.search).get('preset');
        if (!bridge.native && requested) {
            const p = builtinPresets.find(x => x.id === requested);
            if (p)
                current = clone(p);
        }
        settings = cleanSettings(current.settings);
        settings.clickThrough = false;
        selected = leaves(current.layout)[0].id;
        initialized = true;
        await applySettings(settings);
        if (bridge.native && current.window && settings.restoreWindow)
            await tryCall('window.apply', { window: current.window });
        updateStatus();
        dirty = false;
        updateToolbar();
        queueSession();
    }
    catch (e) {
        report(e);
        $('#connection-status').textContent = 'Connection failed — no simulated fallback';
    }
}
// UI inspection/test hook is intentionally absent in the native production app.
if (!bridge.native)
    window.__pulseview = { get state() { return { current, settings, selected, focused, dirty, paused, catalog: [...catalog.values()], views: views.length, chartDebug: views.map(v => ({ type: v.w.type, options: v.charts[0]?.options, range: v.charts[0]?.range, plot: v.charts[0]?.plot, style: v.charts[0]?.styleDebug, hover: v.charts[0]?.hoverState, points: v.charts[0]?.lines[0]?.points.slice(-2) })) }; }, loadPreset, showPicker, showPresets, showWidgetSettings, showSettings, showThemes, showHelp, showSave, showDiagnostics, setChromeHidden, bridge, store, builtinPresets };
boot();
