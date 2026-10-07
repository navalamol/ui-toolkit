/**
 * LdsPropAudit — logs property changes for targeted debugging.
 *
 * Activate per-component: window.__LDS_PROP_DEBUG__ = 'my-element'
 * Activate all:           window.__LDS_PROP_DEBUG__ = '*'
 * Deactivate:             window.__LDS_PROP_DEBUG__ = false
 *
 * Each update logs which props changed, old → new value, and a stack trace.
 * Lit-only: hooks requestUpdate (R2-A render reasons + R2-B thrash) and updated().
 *
 * R2-A — Render reason tracker:
 *   window.__LDS_RENDER_REASONS__[tag] — last 50 requestUpdate calls per tag
 *   { prop, oldSummary, newSummary, sameRef, ts }
 *
 * R2-B — Property thrash detector:
 *   window.__LDS_THRASH__ — incidents where a prop was set >threshold times / second
 *   Threshold: window.__LDS_THRASH_THRESHOLD__ (default 5)
 */

if (typeof window !== 'undefined' && !window.__LDS_RENDER_REASONS__) {
    window.__LDS_RENDER_REASONS__ = {};
}

if (typeof window !== 'undefined' && !window.__LDS_THRASH__) {
    window.__LDS_THRASH__ = [];
}

const THRASH_WINDOW_MS = 1000;
const _thrashTimestamps = new WeakMap();
const _thrashReported   = new WeakMap();

function _thrashThreshold() {
    return (typeof window !== 'undefined' && window.__LDS_THRASH_THRESHOLD__) || 5;
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
    const reasons = window.__LDS_RENDER_REASONS__;
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
        const bucket = Math.floor(now / 3000);
        const key    = `${prop}@${bucket}`;
        if (!reported.has(key)) {
            reported.add(key);
            window.__LDS_THRASH__.push({
                tag, prop, count: times.length, windowMs: THRASH_WINDOW_MS,
                ts: new Date().toISOString(),
                stack: (new Error().stack || '').split('\n').slice(1, 8).join('\n'),
            });
            if (window.__LDS_THRASH__.length > 200) window.__LDS_THRASH__.shift();
        }
    }
}

function _isActive(tag) {
    const t = window.__LDS_PROP_DEBUG__;
    return t && (t === '*' || t === tag);
}

function _logLitChanges(el, changedProps) {
    const tag = el.tagName.toLowerCase();
    if (!_isActive(tag) || !changedProps.size) return;

    console.groupCollapsed(
        `%c[LdsPropAudit] <${tag}> — ${changedProps.size} prop(s) changed`,
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

function _patchMethod(el, name, wrapperFactory) {
    if (typeof el[name] !== 'function') return null;
    const patch = {
        hadOwn: Object.prototype.hasOwnProperty.call(el, name),
        original: el[name],
    };
    el[name] = wrapperFactory(patch.original);
    return patch;
}

function _restoreMethod(el, name, patch) {
    if (!patch) return;
    if (patch.hadOwn) el[name] = patch.original;
    else delete el[name];
}

function attach(el) {
    if (!window.__LDS_PROP_DEBUG__) return;
    if (el.__ldsPropAuditPatched) return;
    el.__ldsPropAuditPatched = true;

    const tag = el.tagName.toLowerCase();

    // R2-A + R2-B: hook requestUpdate (Lit only)
    const requestUpdate = _patchMethod(el, 'requestUpdate', original => function (...args) {
        const [name, oldValue] = args;
        if (name != null) {
            _recordReason(tag, String(name), oldValue, el[name]);
            _checkThrash(el, tag, String(name));
        }
        return original.apply(this, args);
    });

    // Lit: updated(changedProperties: Map) called after every update
    const updated = _patchMethod(el, 'updated', original => function (...args) {
        const result = original.apply(this, args);
        _logLitChanges(el, args[0]);
        return result;
    });

    el.__ldsPropAuditPatch = { requestUpdate, updated };
}

function detach(el) {
    const patch = el.__ldsPropAuditPatch;
    if (patch) {
        _restoreMethod(el, 'updated', patch.updated);
        _restoreMethod(el, 'requestUpdate', patch.requestUpdate);
    }
    delete el.__ldsPropAuditPatch;
    delete el.__ldsPropAuditPatched;
}

const LdsPropAudit = { attach, detach };
export { LdsPropAudit };
