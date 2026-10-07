/**
 * LdsPerfMonitor — per-component TTI (time-to-interactive) tracker.
 *
 * Enable:  window.__LDS_PERF_ENABLED__ = true
 * Report:  window.__LDS_PERF_REPORT__()  — prints sorted console.table
 * Raw:     window.__LDS_PERF__            — { [tagName]: { count, totalMs, avgMs, maxMs, minMs, samples } }
 * Reset:   window.__LDS_PERF_RESET__()
 *
 * TTI is measured from connectedCallback → first completed render (updateComplete).
 * Falls back to measuring connectedCallback duration for non-Lit elements.
 */

const _data = {};
const _slowRenders = [];

if (typeof window !== 'undefined') {
    window.__LDS_PERF__ = _data;
    window.__LDS_SLOW_RENDERS__ = _slowRenders;

    window.__LDS_PERF_REPORT__ = function () {
        if (!Object.keys(_data).length) {
            console.log('%c[LdsPerfMonitor] No data yet — set window.__LDS_PERF_ENABLED__ = true and reload', 'color:#f57c00;font-weight:bold;');
            return [];
        }
        const rows = Object.entries(_data)
            .map(([tag, d]) => ({
                tag,
                renders: d.count,
                'avg ms': Math.round(d.totalMs / d.count),
                'max ms': Math.round(d.maxMs),
                'min ms': d.minMs === Infinity ? '-' : Math.round(d.minMs),
                'last 5 ms': d.samples.slice(-5).join(', '),
            }))
            .sort((a, b) => b['avg ms'] - a['avg ms']);

        console.log('%c[LdsPerfMonitor] Component TTI (slowest first)', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };

    window.__LDS_PERF_RESET__ = function () {
        Object.keys(_data).forEach(k => delete _data[k]);
        console.log('%c[LdsPerfMonitor] Reset', 'color:#1a73e8;font-weight:bold;');
    };
}

function _record(tag, ms) {
    if (!_data[tag]) {
        _data[tag] = { count: 0, totalMs: 0, maxMs: 0, minMs: Infinity, samples: [] };
    }
    const d = _data[tag];
    d.count++;
    d.totalMs += ms;
    d.maxMs = Math.max(d.maxMs, ms);
    d.minMs = Math.min(d.minMs, ms);
    d.samples.push(Math.round(ms));
    if (d.samples.length > 20) d.samples.shift();

    if (ms > 500) {
        console.warn(`%c[LdsPerfMonitor] <${tag}> slow render: ${Math.round(ms)}ms`, 'color:#f57c00;font-weight:bold;');
        _slowRenders.push({ tag, ms: Math.round(ms), ts: new Date().toISOString(), stack: new Error().stack });
        if (_slowRenders.length > 100) _slowRenders.shift();
    }
}

function attach(el) {
    if (!window.__LDS_PERF_ENABLED__) return;

    const tag = el.tagName.toLowerCase();
    const t0 = performance.now();

    // Lit: updateComplete resolves after the first committed update
    if (el.updateComplete && typeof el.updateComplete.then === 'function') {
        el.updateComplete.then(() => _record(tag, performance.now() - t0));
        return;
    }

    // Fallback: measure connectedCallback duration
    _record(tag, performance.now() - t0);
}

function detach(_el) {
    // Timing data kept for session report — no listeners to remove
}

const LdsPerfMonitor = { attach, detach };
export { LdsPerfMonitor };
