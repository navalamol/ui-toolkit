/**
 * LdsVitals — Core Web Vitals + Long Task detector.
 * Page-level tool: call LdsVitals.init() once (LitDebugMixin gates it).
 *
 * window.__LDS_VITALS__ = {
 *   lcp:       { valueMs, element, url, ts }
 *   cls:       { value, entries[] }
 *   inp:       { valueMs, eventType, ts }      — INP if supported, else FID
 *   longTasks: [{ durationMs, ts }]            — tasks >50ms, capped at 100
 * }
 */

const _vitals = {
    lcp: null,
    cls: { value: 0, entries: [] },
    inp: null,
    longTasks: [],
};

let _initialized = false;

function init() {
    if (_initialized || typeof window === 'undefined') return;
    _initialized = true;
    window.__LDS_VITALS__ = _vitals;

    if (typeof PerformanceObserver === 'undefined') return;

    // LCP
    try {
        new PerformanceObserver(list => {
            const last = list.getEntries().at(-1);
            if (!last) return;
            _vitals.lcp = {
                valueMs: Math.round(last.startTime),
                element: last.element?.tagName?.toLowerCase() || 'unknown',
                url:     last.url || null,
                ts:      new Date().toISOString(),
            };
        }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch {}

    // CLS
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (!entry.hadRecentInput) {
                    _vitals.cls.value += entry.value;
                    _vitals.cls.entries.push({
                        value:   +entry.value.toFixed(4),
                        sources: (entry.sources || [])
                            .map(s => s.node?.tagName?.toLowerCase())
                            .filter(Boolean),
                        ts: new Date().toISOString(),
                    });
                    if (_vitals.cls.entries.length > 20) _vitals.cls.entries.shift();
                }
            }
        }).observe({ type: 'layout-shift', buffered: true });
    } catch {}

    // INP (falls back to FID)
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                const ms = Math.round(entry.duration || entry.processingStart - entry.startTime || 0);
                if (!_vitals.inp || ms > _vitals.inp.valueMs) {
                    _vitals.inp = { valueMs: ms, eventType: entry.name, ts: new Date().toISOString() };
                }
            }
        }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
    } catch {
        try {
            new PerformanceObserver(list => {
                const e = list.getEntries()[0];
                if (!e) return;
                _vitals.inp = {
                    valueMs: Math.round(e.processingStart - e.startTime),
                    eventType: e.name,
                    ts: new Date().toISOString(),
                };
            }).observe({ type: 'first-input', buffered: true });
        } catch {}
    }

    // Long Tasks
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                _vitals.longTasks.push({
                    durationMs: Math.round(entry.duration),
                    ts: new Date(performance.timeOrigin + entry.startTime).toISOString(),
                });
                if (_vitals.longTasks.length > 100) _vitals.longTasks.shift();
            }
        }).observe({ type: 'longtask', buffered: true });
    } catch {}
}

function detach() {} // page-level — no per-element cleanup

const LdsVitals = { init, detach };
export { LdsVitals };
