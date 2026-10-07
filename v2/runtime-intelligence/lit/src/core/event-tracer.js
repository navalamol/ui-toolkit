/**
 * LdsEventTracer — records every dispatched event/action across the app.
 *
 * Generic: works with any event bus. Use patchDispatch() to wire your dispatch function.
 * Syndigo: custom/ui-platform/AciPlugin.js calls patchDispatch() for aci.dispatch.
 *
 * Enable:   window.__LDS_EVENTS_TRACE__ = true
 * Timeline: window.__LDS_EVENTS_TIMELINE__          — array of recorded events
 * Report:   window.__LDS_EVENTS_REPORT__()           — pretty-prints the timeline
 * Filter:   window.__LDS_EVENTS_FILTER__ = 'scope'  — filter by action name substring
 * Clear:    window.__LDS_EVENTS_CLEAR__()
 *
 * R2-C — Frequency + source map:
 *   window.__LDS_EVENTS_FREQ__          — { [eventName]: { count, sources[] } }
 *   window.__LDS_EVENTS_FREQ_REPORT__() — sorted frequency table in console
 *
 * Each timeline entry: { seq, ts, elapsed, name, from, detail, detailSummary }
 */

const _timeline = [];
let _seq     = 0;
let _patched = false;
let _t0      = performance.now();

if (typeof window !== 'undefined') {
    window.__LDS_EVENTS_TIMELINE__ = _timeline;

    if (!window.__LDS_EVENTS_FREQ__) window.__LDS_EVENTS_FREQ__ = {};

    window.__LDS_EVENTS_REPORT__ = function () {
        const filter = (window.__LDS_EVENTS_FILTER__ || '').toLowerCase();
        const rows = _timeline
            .filter(e => !filter || e.name.toLowerCase().includes(filter))
            .map(e => ({
                '#': e.seq,
                'time': e.ts,
                'elapsed ms': e.elapsed,
                'event': e.name,
                'from': e.from || '?',
                'detail (truncated)': e.detailSummary,
            }));

        if (!rows.length) {
            console.log('%c[LdsEventTracer] No events recorded. Set window.__LDS_EVENTS_TRACE__ = true', 'color:#f57c00;font-weight:bold;');
            return [];
        }

        const filterNote = filter ? ` (filtered: "${filter}")` : '';
        console.log(`%c[LdsEventTracer] Event Timeline — ${rows.length} event(s)${filterNote}`, 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        console.log('%cFull entries in window.__LDS_EVENTS_TIMELINE__', 'color:#9c27b0;');
        return rows;
    };

    window.__LDS_EVENTS_CLEAR__ = function () {
        _timeline.length = 0;
        _seq = 0;
        _t0  = performance.now();
        if (window.__LDS_EVENTS_FREQ__) {
            for (const k of Object.keys(window.__LDS_EVENTS_FREQ__)) delete window.__LDS_EVENTS_FREQ__[k];
        }
        console.log('%c[LdsEventTracer] Cleared', 'color:#1a73e8;font-weight:bold;');
    };

    window.__LDS_EVENTS_FREQ_REPORT__ = function () {
        const freq = window.__LDS_EVENTS_FREQ__ || {};
        const rows = Object.entries(freq)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, d]) => ({
                event:   name,
                count:   d.count,
                flag:    d.count > 20 ? '🔥 HIGH' : '',
                sources: d.sources.join(', ') || '?',
            }));
        if (!rows.length) {
            console.log('%c[LdsEventTracer] No frequency data', 'color:#f57c00;');
            return [];
        }
        console.log('%c[LdsEventTracer] Event Frequency', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };
}

function _summarise(detail) {
    if (!detail) return '';
    try {
        const s = JSON.stringify(detail, (_k, v) => {
            if (typeof v === 'function') return '[Function]';
            if (typeof v === 'object' && v !== null && v.tagName) return `[DOMNode <${v.tagName.toLowerCase()}>]`;
            return v;
        });
        return s.length > 120 ? s.slice(0, 120) + '…' : s;
    } catch (_) {
        return String(detail);
    }
}

// Walk Error stack to find the first frame that looks like a custom element class
function _callerFromStack() {
    try {
        const lines = (new Error().stack || '').split('\n');
        for (const line of lines) {
            // Match custom element tag names: kebab-case words (contain at least one dash)
            const m = line.match(/\/([a-z][a-z0-9]*(?:-[a-z0-9]+)+)(?:\/|\.js)/);
            if (m) return m[1];
        }
    } catch (_) {}
    return null;
}

function _recordEvent(name, detail) {
    if (!window.__LDS_EVENTS_TRACE__) return;
    const entry = {
        seq:  ++_seq,
        ts:   new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }),
        elapsed: Math.round(performance.now() - _t0),
        name,
        from: _callerFromStack(),
        detail,
        detailSummary: _summarise(detail),
    };
    _timeline.push(entry);
    if (_timeline.length > 500) _timeline.shift();

    // R2-C: update frequency table
    const freq = window.__LDS_EVENTS_FREQ__;
    if (freq) {
        if (!freq[name]) freq[name] = { count: 0, sources: [] };
        freq[name].count++;
        const src = entry.from;
        if (src && !freq[name].sources.includes(src)) {
            freq[name].sources.push(src);
            if (freq[name].sources.length > 15) freq[name].sources.shift();
        }
    }

    if (window.__LDS_EVENTS_VERBOSE__) {
        console.log(`%c[LdsEventTracer] ${name}`, 'color:#9c27b0;font-weight:bold;', entry.from ? `from <${entry.from}>` : '', detail);
    }
}

/**
 * Wire any dispatch function. The wrapper calls _recordEvent(name, detail)
 * before delegating to the original.
 *
 * Example (generic):
 *   LdsEventTracer.patchDispatch(wrap => {
 *     myBus.dispatch = wrap(myBus.dispatch.bind(myBus));
 *   });
 *
 * The callback receives a factory fn(origDispatch) → wrappedDispatch,
 * where origDispatch takes (action) and wrappedDispatch does the same.
 */
function patchDispatch(installFn) {
    if (_patched) return;
    _patched = true;

    installFn(function (origDispatch) {
        return function (action) {
            if (window.__LDS_EVENTS_TRACE__) {
                const name = (action && (action.name || action.type)) || 'unknown';
                _recordEvent(name, action && action.detail);
            }
            return origDispatch(action);
        };
    });
}

// attach/detach are no-ops for the generic tracer — patching is done via patchDispatch
function attach(_el) {}
function detach(_el) {}

const LdsEventTracer = { attach, detach, patchDispatch, recordEvent: _recordEvent };
export { LdsEventTracer };
