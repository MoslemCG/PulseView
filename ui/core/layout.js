/** Pure binary-split model. No DOM, grid library, or responsive breakpoints. */
export const MAX_LEAVES = 128;
export const MAX_DEPTH = 32;
export const MIN_PANE = { width: 152, height: 110 };
export const GUTTER = 6;
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export const clone = value => structuredClone(value);
export const leaf = (widget = null, id = uid()) => ({ kind: 'leaf', id, widget });
export const split = (axis, a, b, ratio = .5, id = uid()) => ({ kind: 'split', id, axis, ratio, a, b });
export const leaves = node => node.kind === 'leaf' ? [node] : [...leaves(node.a), ...leaves(node.b)];
export function find(node, id) { return node.id === id ? node : node.kind === 'split' ? find(node.a, id) || find(node.b, id) : null; }
/** Topmost split of the same-direction run that directly contains `id` (a row or column). */
export function groupRoot(tree, id) {
    let top = parent(tree, id);
    for (let up = top && parent(tree, top.id); up && up.axis === top.axis; up = parent(tree, up.id))
        top = up;
    return top;
}
/** Give every cell of that run the same size. Nested splits along the same axis form one
 * row/column; subtrees in the other direction count as one cell and keep their ratios.
 * `length` (px along the axis) makes the result exact despite gutters; 0 ignores gutters. */
export function equalizeGroup(tree, id, length = 0) {
    const top = groupRoot(tree, id);
    if (!top) return false;
    const units = n => n.kind === 'split' && n.axis === top.axis ? units(n.a) + units(n.b) : 1;
    const total = units(top), g = length > 0 ? GUTTER : 0, cell = length > 0 ? (length - (total - 1) * g) / total : 1;
    const size = k => k * cell + (k - 1) * g;
    (function apply(n) {
        if (n.kind !== 'split' || n.axis !== top.axis) return;
        const a = units(n.a), b = units(n.b);
        n.ratio = Math.min(.98, Math.max(.02, size(a) / (size(a) + size(b))));
        apply(n.a); apply(n.b);
    })(top);
    return true;
}
export function parent(node, id) {
    if (node.kind !== 'split')
        return null;
    return node.a.id === id || node.b.id === id ? node : parent(node.a, id) || parent(node.b, id);
}
export function replace(node, id, replacement) {
    if (node.id === id)
        return replacement;
    if (node.kind === 'leaf')
        return node;
    return { ...node, a: replace(node.a, id, replacement), b: replace(node.b, id, replacement) };
}
export function divide(root, id, axis, widget = null) {
    if (!['x', 'y'].includes(axis))
        throw new Error('Split axis must be x or y.');
    if (leaves(root).length >= MAX_LEAVES)
        throw new Error(`A layout can contain at most ${MAX_LEAVES} panes.`);
    const pane = find(root, id);
    if (!pane || pane.kind !== 'leaf')
        throw new Error('Select a pane to split.');
    const result = replace(root, id, split(axis, clone(pane), leaf(widget)));
    validateLayout(result);
    return result;
}
export function remove(root, id) {
    if (root.id === id)
        return leaf(null, id);
    const p = parent(root, id);
    if (!p)
        return root;
    return replace(root, p.id, clone(p.a.id === id ? p.b : p.a));
}
export function swap(root, aId, bId) {
    if (aId === bId)
        return root;
    const a = find(root, aId), b = find(root, bId);
    if (a?.kind !== 'leaf' || b?.kind !== 'leaf')
        return root;
    const result = clone(root);
    find(result, aId).widget = clone(b.widget);
    find(result, bId).widget = clone(a.widget);
    return result;
}
export function minSize(node) {
    if (node.kind === 'leaf')
        return { ...MIN_PANE };
    const a = minSize(node.a), b = minSize(node.b);
    return node.axis === 'x'
        ? { width: a.width + b.width + GUTTER, height: Math.max(a.height, b.height) }
        : { width: Math.max(a.width, b.width), height: a.height + b.height + GUTTER };
}
export function validateLayout(root) {
    let count = 0;
    const ids = new Set();
    function visit(n, depth) {
        if (!n || typeof n !== 'object' || Array.isArray(n))
            throw new Error('Invalid layout node.');
        if (depth > MAX_DEPTH)
            throw new Error(`Maximum split depth is ${MAX_DEPTH}.`);
        if (typeof n.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(n.id) || ids.has(n.id))
            throw new Error('Pane IDs must be unique strings.');
        ids.add(n.id);
        if (n.kind === 'leaf') {
            if (++count > MAX_LEAVES)
                throw new Error('Too many panes.');
            if (n.widget !== null && (!n.widget || typeof n.widget !== 'object' || Array.isArray(n.widget)))
                throw new Error('Invalid widget.');
        }
        else if (n.kind === 'split') {
            if (!['x', 'y'].includes(n.axis) || !Number.isFinite(n.ratio) || n.ratio < .02 || n.ratio > .98)
                throw new Error('Invalid split ratio or direction.');
            visit(n.a, depth + 1);
            visit(n.b, depth + 1);
        }
        else
            throw new Error('Unknown layout node type.');
    }
    visit(root, 0);
    return root;
}
export function validatePreset(p) {
    if (!p || p.schemaVersion !== 1)
        throw new Error('Unsupported preset version (expected 1).');
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100)
        throw new Error('Invalid preset name.');
    if (p.id !== undefined && (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(p.id)))
        throw new Error('Invalid preset ID.');
    validateLayout(p.layout);
    if (p.settings && (typeof p.settings !== 'object' || Array.isArray(p.settings)))
        throw new Error('Invalid preset settings.');
    if (p.window && (typeof p.window !== 'object' || Array.isArray(p.window)))
        throw new Error('Invalid window state.');
    return p;
}
export class UndoStack {
    constructor(limit = 80) { this.limit = limit; this.undoItems = []; this.redoItems = []; }
    push(value) { this.undoItems.push(clone(value)); if (this.undoItems.length > this.limit)
        this.undoItems.shift(); this.redoItems = []; }
    undo(current) { if (!this.undoItems.length)
        return current; this.redoItems.push(clone(current)); return this.undoItems.pop(); }
    redo(current) { if (!this.redoItems.length)
        return current; this.undoItems.push(clone(current)); return this.redoItems.pop(); }
    clear() { this.undoItems = []; this.redoItems = []; }
}
