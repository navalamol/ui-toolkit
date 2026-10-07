/**
 * RufPropAudit — logs property changes for targeted debugging.
 *
 * Activate per-component: window.__RUF_PROP_DEBUG__ = 'rock-scope-selector'
 * Activate all:           window.__RUF_PROP_DEBUG__ = '*'
 * Deactivate:             window.__RUF_PROP_DEBUG__ = false
 *
 * Each update logs:
 *   - which props changed
 *   - old value → new value
 *   - a stack trace so you know WHAT triggered the change
 *
 * Works for both Lit (updated hook) and Polymer (_propertiesChanged).
 *
 * R2-A — Render reason tracker:
 *   window.__RUF_RENDER_REASONS__[tag] — last 50 requestUpdate calls per tag
 *   { prop, oldSummary, newSummary, sameRef, ts }
 *   Panel: Perf tab row expansion shows "Last changes that triggered updates"
 *
 * R2-B — Property thrash detector:
 *   window.__RUF_THRASH__ — incidents where a prop was set >threshold times / second
 *   Threshold: window.__RUF_THRASH_THRESHOLD__ (default 5)
 *   Panel: Pinpoint tab shows property-thrash issue type
 */

// ── R2-A: Render reason store ──────────────────────────────────────────────
if (typeof window !== 'undefined' && !window.__RUF_RENDER_REASONS__) {
    window.__RUF_RENDER_REASONS__ = {};
}

// ── R2-B: Thrash store ─────────────────────────────────────────────────────
if (typeof window !== 'undefined' && !window.__RUF_THRASH__) {
    window.__RUF_THRASH__ = [];
}

const THRASH_WINDOW_MS = 1000;
const _thrashTimestamps = new WeakMap(); // el → { [prop]: number[] }
const _thrashReported   = new WeakMap(); // el → Set<string>  (key = prop@bucket)

function _thrashThreshold() {
    return (typeof window !== 'undefined' && window.__RUF_THRASH_THRESHOLD__) || 5;
}

function _valueSummary(v, other) {
    if (v === null)      return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string')  return v.length > 50 ? `"${v.slice(0, 50)}…"` : `"${v}"`;
    if (t === 'number' || t === 'boolean') return String(v);
    if (Array.isArray(v)) {
        const sameRef = v === other ? ' (same ref ⚠️)' : '';
        return `Array[${v.length}]${sameRef}`;
    }
    if (t === 'object') {
        const sameRef = v === other ? ' (same ref ⚠️)' : '';
        const keys = Object.keys(v).slice(0, 3).join(',');
        return `{${keys}}${sameRef}`;
    }
    return t;
}

function _recordReason(tag, prop, oldValue, newValue) {
    const reasons = window.__RUF_RENDER_REASONS__;
    if (!reasons) return;
    if (!reasons[tag]) reasons[tag] = [];
    const arr = reasons[tag];
    arr.push({
        prop,
        oldSummary: _valueSummary(oldValue, newValue),
        newSummary: _valueSummary(newValue, oldValue),
        sameRef:    oldValue !== null && typeof oldValue === 'object' && oldValue === newValue,
        ts: new Date().toISOString(),
    });
    if (arr.length > 50) arr.shift();
}

function _checkThrash(el, tag, prop) {
    const now = Date.now();
    if (!_thrashTimestamps.has(el)) _thrashTimestamps.set(el, {});
    const propMap = _thrashTimestamps.get(el);
    if (!propMap[prop]) propMap[prop] = [];
    const times = propMap[prop];
    times.push(now);
    while (times.length && now - times[0] > THRASH_WINDOW_MS) times.shift();

    if (times.length > _thrashThreshold()) {
        if (!_thrashReported.has(el)) _thrashReported.set(el, new Set());
        const reported = _thrashReported.get(el);
        const bucket = Math.floor(now / 3000); // report once per 3-second bucket per prop
        const key    = `${prop}@${bucket}`;
        if (!reported.has(key)) {
            reported.add(key);
            window.__RUF_THRASH__.push({
                tag, prop, count: times.length, windowMs: THRASH_WINDOW_MS,
                ts: new Date().toISOString(),
                stack: (new Error().stack || '').split('\n').slice(1, 8).join('\n'),
            });
            if (window.__RUF_THRASH__.length > 200) window.__RUF_THRASH__.shift();
        }
    }
}

function _isActive(tag) {
    const t = window.__RUF_PROP_DEBUG__;
    return t && (t === '*' || t === tag);
}

function _logLitChanges(el, changedProps) {
    const tag = el.tagName.toLowerCase();
    if (!_isActive(tag) || !changedProps.size) return;

    console.groupCollapsed(
        `%c[PropAudit] <${tag}> — ${changedProps.size} prop(s) changed`,
        'color:#9c27b0;font-weight:bold;'
    );
    changedProps.forEach((oldVal, key) => {
        const newVal = el[key];
        const changed = oldVal !== newVal;
        const label = changed ? `  ${key}` : `  ${key} (identity same)`;
        console.log(label, '\n    before:', oldVal, '\n    after: ', newVal);
    });
    console.trace('update triggered by');
    console.groupEnd();
}

function _logPolymerChanges(el, current, changed, old) {
    const tag = el.tagName.toLowerCase();
    if (!_isActive(tag)) return;

    const keys = Object.keys(changed || {});
    if (!keys.length) return;

    console.groupCollapsed(
        `%c[PropAudit] <${tag}> — ${keys.length} prop(s) changed`,
        'color:#9c27b0;font-weight:bold;'
    );
    for (const k of keys) {
        console.log(`  ${k}`, '\n    before:', old[k], '\n    after: ', current[k]);
    }
    console.trace('update triggered by');
    console.groupEnd();
}

function attach(el) {
    // Skip when no debug target is set.
    if (!window.__RUF_PROP_DEBUG__) return;
    if (el.__rufPropAuditPatched) return;
    el.__rufPropAuditPatched = true;

    const tag = el.tagName.toLowerCase();

    // ── R2-A + R2-B: requestUpdate hook (Lit elements only) ───────────────
    // requestUpdate(name, oldValue) is called synchronously when a Lit property
    // is set. Hooking here lets us record WHY an update was scheduled and detect
    // rapid-fire property mutations (thrash) before the DOM render runs.
    if (typeof el.requestUpdate === 'function') {
        const origReqUpd = el.requestUpdate.bind(el);
        el.requestUpdate = function (name, oldValue) {
            if (name != null) {
                _recordReason(tag, String(name), oldValue, el[name]);
                _checkThrash(el, tag, String(name));
            }
            return origReqUpd(name, oldValue);
        };
    }

    // ── Lit: updated(changedProperties: Map) called after every update ────
    if (typeof el.updated === 'function') {
        const orig = el.updated.bind(el);
        el.updated = function (changedProps) {
            orig(changedProps);
            _logLitChanges(el, changedProps);
        };
        return; // LitElement — do not also patch Polymer lifecycle
    }

    // ── Polymer: _propertiesChanged(current, changed, old) ────────────────
    if (typeof el._propertiesChanged === 'function') {
        const orig = el._propertiesChanged.bind(el);
        el._propertiesChanged = function (current, changed, old) {
            orig(current, changed, old);
            _logPolymerChanges(el, current, changed, old);
        };
    }
}

function detach(el) {
    delete el.__rufPropAuditPatched;
}

const RufPropAudit = { attach, detach };
export { RufPropAudit };
