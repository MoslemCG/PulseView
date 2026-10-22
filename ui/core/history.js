/** Timestamped history. Never invent intermediate measurements or backfill native history. */
export class HistoryStore {
    constructor(retention = 600, maxPerMetric = 14400) { this.retention = retention; this.maxPerMetric = maxPerMetric; this.series = new Map(); this.latest = new Map(); this.lastTime = 0; }
    add(snapshot) {
        const t = Number(snapshot.timestamp);
        if (!Number.isFinite(t))
            return;
        this.lastTime = Math.max(t, this.lastTime);
        for (const [id, value] of Object.entries(snapshot.values || {})) {
            const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
            let a = this.series.get(id);
            if (!a) {
                a = [];
                this.series.set(id, a);
            }
            // A resumed/suspended provider is not a continuous line through missing time.
            a.push({ t, v });
            const cutoff = t - this.retention * 1000;
            let start = 0;
            while (start < a.length && a[start].t < cutoff)
                start++;
            if (start || a.length > this.maxPerMetric)
                a.splice(0, Math.max(start, a.length - this.maxPerMetric));
            this.latest.set(id, v);
        }
    }
    get(id, seconds = 120, now = this.lastTime) { return (this.series.get(id) || []).filter(p => p.t >= now - seconds * 1000 && p.t <= now); }
    value(id) { return this.latest.get(id) ?? null; }
    clear() { this.series.clear(); this.latest.clear(); this.lastTime = 0; }
}
