/**
 * RufPerfMonitor — per-component TTI (time-to-interactive) tracker.
 *
 * Enable:  window.__RUF_PERF_ENABLED__ = true  (before or after app loads)
 * Report:  window.__RUF_PERF_REPORT__()         — prints sorted console.table
 * Raw:     window.__RUF_PERF__                   — { [tagName]: { count, avgMs, maxMs, minMs, samples } }
 * Reset:   window.__RUF_PERF_RESET__()
 *
 * TTI is measured from connectedCallback → first completed render:
 *   Lit      — updateComplete Promise
 *   Polymer  — ready() callback (fires once after first render)
 *   Fallback — end of connectedCallback itself
 */

const _data = {};
const _slowRenders = [];

if (typeof window !== 'undefined') {
    window.__RUF_PERF__ = _data;
    window.__RUF_SLOW_RENDERS__ = _slowRenders;

    window.__RUF_PERF_REPORT__ = function () {
        if (!Object.keys(_data).length) {
            console.log('%c[RufPerfMonitor] No data yet — set window.__RUF_PERF_ENABLED__ = true and reload', 'color:#f57c00;font-weight:bold;');
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

        console.log('%c[RufPerfMonitor] Component TTI (slowest first)', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };

    window.__RUF_PERF_RESET__ = function () {
        Object.keys(_data).forEach(k => delete _data[k]);
        console.log('%c[RufPerfMonitor] Reset', 'color:#1a73e8;font-weight:bold;');
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
        console.warn(`%c[RufPerfMonitor] <${tag}> slow render: ${Math.round(ms)}ms`, 'color:#f57c00;font-weight:bold;');
        _slowRenders.push({ tag, ms: Math.round(ms), ts: new Date().toISOString(), stack: new Error().stack });
        if (_slowRenders.length > 100) _slowRenders.shift();
    }
}

function attach(el) {
    if (!window.__RUF_PERF_ENABLED__) return;

    const tag = el.tagName.toLowerCase();
    const t0 = performance.now();

    // ── Lit: updateComplete resolves after the first committed update ──────
    if (el.updateComplete && typeof el.updateComplete.then === 'function') {
        el.updateComplete.then(() => _record(tag, performance.now() - t0));
        return;
    }

    // ── Polymer: ready() fires once, after the first render ───────────────
    if (typeof el.ready === 'function' && !el.__rufPerfReadyPatched) {
        el.__rufPerfReadyPatched = true;
        const origReady = el.ready.bind(el);
        el.ready = function () {
            origReady();
            _record(tag, performance.now() - t0);
            // Restore — ready() only fires once anyway, but clean up the patch
            el.ready = origReady;
        };
        return;
    }

    // ── Fallback: measure connectedCallback duration only ─────────────────
    _record(tag, performance.now() - t0);
}

function detach(_el) {
    // Timing data is kept for the session report
    // No listeners to remove
}

const RufPerfMonitor = { attach, detach };
export { RufPerfMonitor };
