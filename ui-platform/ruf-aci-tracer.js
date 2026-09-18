/**
 * RufAciTracer — records every ACI action dispatched across the app.
 *
 * Enable:   window.__RUF_ACI_TRACE__ = true
 * Disable:  window.__RUF_ACI_TRACE__ = false
 * Timeline: window.__RUF_ACI_TIMELINE__        — array of recorded actions
 * Report:   window.__RUF_ACI_REPORT__()         — pretty-prints the timeline
 * Filter:   window.__RUF_ACI_FILTER__ = 'scope' — show only actions whose
 *             name contains this substring (case-insensitive)
 * Clear:    window.__RUF_ACI_CLEAR__()
 *
 * R2-C — Frequency + source map:
 *   window.__RUF_ACI_FREQ__   — { [actionName]: { count, sources[] } }
 *   window.__RUF_ACI_FREQ_REPORT__()  — sorted frequency table in console
 *   Panel: ACI tab has a "Frequency" toggle; actions >20 dispatches are flagged
 *
 * Each timeline entry:
 *   { seq, ts, elapsed, name, from, detail }
 *
 * "from" is the tag of the element that called dispatch(), resolved by
 * walking the call stack to find the nearest ruf-element caller.
 */

const _timeline = [];
let _seq     = 0;
let _patched = false;
let _t0      = performance.now();

if (typeof window !== 'undefined') {
    window.__RUF_ACI_TIMELINE__ = _timeline;

    // R2-C
    if (!window.__RUF_ACI_FREQ__) window.__RUF_ACI_FREQ__ = {};

    window.__RUF_ACI_REPORT__ = function () {
        const filter = (window.__RUF_ACI_FILTER__ || '').toLowerCase();
        const rows = _timeline
            .filter(e => !filter || e.name.toLowerCase().includes(filter))
            .map(e => ({
                '#': e.seq,
                'time': e.ts,
                'elapsed ms': e.elapsed,
                'action': e.name,
                'from': e.from || '?',
                'detail (truncated)': e.detailSummary,
            }));

        if (!rows.length) {
            console.log('%c[AciTracer] No actions recorded yet. Set window.__RUF_ACI_TRACE__ = true', 'color:#f57c00;font-weight:bold;');
            return [];
        }

        const filterNote = filter ? ` (filtered: "${filter}")` : '';
        console.log(`%c[AciTracer] ACI Timeline — ${rows.length} action(s)${filterNote}`, 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        console.log('%cFull entries in window.__RUF_ACI_TIMELINE__', 'color:#9c27b0;');
        return rows;
    };

    window.__RUF_ACI_CLEAR__ = function () {
        _timeline.length = 0;
        _seq = 0;
        _t0  = performance.now();
        if (window.__RUF_ACI_FREQ__) {
            for (const k of Object.keys(window.__RUF_ACI_FREQ__)) delete window.__RUF_ACI_FREQ__[k];
        }
        console.log('%c[AciTracer] Cleared', 'color:#1a73e8;font-weight:bold;');
    };

    // R2-C: frequency report helper
    window.__RUF_ACI_FREQ_REPORT__ = function () {
        const freq = window.__RUF_ACI_FREQ__ || {};
        const rows = Object.entries(freq)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, d]) => ({
                action: name,
                count:  d.count,
                flag:   d.count > 20 ? '🔥 HIGH' : '',
                sources: d.sources.join(', ') || '?',
            }));
        if (!rows.length) {
            console.log('%c[AciTracer] No frequency data', 'color:#f57c00;');
            return [];
        }
        console.log('%c[AciTracer] ACI Frequency', 'color:#1a73e8;font-weight:bold;font-size:14px;');
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

// Walk Error stack to find the first frame that belongs to a rock-* / pebble-* element
function _callerFromStack() {
    try {
        const lines = (new Error().stack || '').split('\n');
        for (const line of lines) {
            const m = line.match(/at (\w[\w-]*)\.?\w* \(/);
            if (m && (m[1].includes('rock') || m[1].includes('pebble') || m[1].includes('bedrock'))) {
                return m[1].replace(/([A-Z])/g, c => `-${c.toLowerCase()}`).replace(/^-/, '');
            }
        }
    } catch (_) {}
    return null;
}

// Patch the aci dispatch method once, lazily, on first element connect
function _patchAci(aciInstance) {
    if (_patched || !aciInstance || typeof aciInstance.dispatch !== 'function') return;
    _patched = true;

    const orig = aciInstance.dispatch.bind(aciInstance);
    aciInstance.dispatch = function (action) {
        if (window.__RUF_ACI_TRACE__) {
            const name = (action && (action.name || action.type)) || 'unknown';
            const entry = {
                seq:  ++_seq,
                ts:   new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }),
                elapsed: Math.round(performance.now() - _t0),
                name,
                from: _callerFromStack(),
                detail: action && action.detail,
                detailSummary: _summarise(action && action.detail),
            };
            _timeline.push(entry);
            if (_timeline.length > 500) _timeline.shift();

            // R2-C: update frequency table
            const freq = window.__RUF_ACI_FREQ__;
            if (freq) {
                if (!freq[name]) freq[name] = { count: 0, sources: [] };
                freq[name].count++;
                const src = entry.from;
                if (src && !freq[name].sources.includes(src)) {
                    freq[name].sources.push(src);
                    if (freq[name].sources.length > 15) freq[name].sources.shift();
                }
            }

            // Live log if verbose mode on
            if (window.__RUF_ACI_VERBOSE__) {
                console.log(`%c[AciTracer] ${name}`, 'color:#9c27b0;font-weight:bold;', entry.from ? `from <${entry.from}>` : '', action && action.detail);
            }
        }
        return orig(action);
    };
}

function attach(el) {
    // el.aci is set by aci.uiInit mixin — try to patch on first available instance
    if (!_patched && el.aci) {
        _patchAci(el.aci);
    }
}

function detach(_el) {
    // Nothing to clean up — patch persists for the session
}

const RufAciTracer = { attach, detach };
export { RufAciTracer };
