/**
 * LdsErrorBoundary — catches render/update crashes in any element using this mixin.
 *
 * Always active: no flag required. Prevents a single broken component from
 * crashing the entire page. Sets `isComponentErrored = true` on the element
 * and injects a visible fallback UI.
 *
 * Error log: window.__LDS_ERRORS__          — array of all caught errors
 * Clear:     window.__LDS_ERRORS__.length = 0
 *
 * Auto-POST on crash (optional):
 *   window.__LDS_CRASH_ENDPOINT__  = 'https://support.example.com/lds-ingest'
 *   window.__LDS_CRASH_AUTO_POST__ = true
 *   When both are set, the first CRITICAL crash POSTs a lightweight report
 *   automatically. The user sees a brief banner; support gets the data.
 */

const _errors = [];

if (typeof window !== 'undefined') {
    window.__LDS_ERRORS__ = _errors;
}

const _FALLBACK_CSS = [
    'display:flex',
    'align-items:center',
    'gap:8px',
    'padding:8px 12px',
    'background:#fff3f3',
    'border:1px solid #f44336',
    'border-radius:4px',
    'font-family:monospace',
    'font-size:12px',
    'color:#c62828',
    'min-height:40px',
    'box-sizing:border-box',
    'width:100%',
].join(';');

function _injectFallback(el, err) {
    try {
        const div = document.createElement('div');
        div.setAttribute('role', 'alert');
        div.style.cssText = _FALLBACK_CSS;
        div.innerHTML =
            `<span>⚠️</span>` +
            `<span><strong>${el.tagName.toLowerCase()}</strong> failed to render — ${_esc(err.message)}</span>`;
        const root = el.shadowRoot || el;
        root.appendChild(div);
        el.__ldsFallback = div;
    } catch (_) {}
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

let _autoPostFired = false;

function _tryAutoPost(entry) {
    if (_autoPostFired) return;
    try {
        if (!window.__LDS_CRASH_AUTO_POST__ || !window.__LDS_CRASH_ENDPOINT__) return;
        _autoPostFired = true;

        const endpoint = window.__LDS_CRASH_ENDPOINT__;
        const report = {
            sessionId:    window.__LDS_SESSION_ID__ || null,
            reportTime:   new Date().toISOString(),
            triggerError: entry,
            errors:       [..._errors],
            perf:         { ...(window.__LDS_PERF__ || {}) },
            console:      [...(window.__LDS_CONSOLE__ || [])],
            eventsTimeline: [...(window.__LDS_EVENTS_TIMELINE__ || [])],
            environment: {
                url:     location.href,
                browser: navigator.userAgent.slice(0, 120),
            },
        };

        fetch(endpoint, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(report),
        }).then(() => {
            console.log('%c[LdsErrorBoundary] Crash report auto-posted to', 'color:#a6e3a1;font-weight:bold;', endpoint);
            _showCrashBanner();
        }).catch(postErr => {
            console.warn('[LdsErrorBoundary] Auto-post failed:', postErr.message);
        });
    } catch (_) {}
}

function _showCrashBanner() {
    try {
        const div = document.createElement('div');
        div.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
            'background:#1e3a1e', 'color:#a6e3a1', 'font-family:monospace',
            'font-size:12px', 'padding:8px 16px', 'display:flex',
            'align-items:center', 'gap:10px', 'border-bottom:1px solid #a6e3a1',
        ].join(';');
        div.innerHTML = '✅ <strong>Crash report sent to support automatically.</strong> You can continue using the app.';
        const close = document.createElement('button');
        close.textContent = '✕';
        close.style.cssText = 'background:none;border:none;color:#a6e3a1;cursor:pointer;margin-left:auto;font-size:14px;';
        close.onclick = () => div.remove();
        div.appendChild(close);
        document.body.appendChild(div);
        setTimeout(() => { try { div.remove(); } catch (_) {} }, 8000);
    } catch (_) {}
}

function _record(el, err, phase) {
    const entry = {
        tag:     el.tagName.toLowerCase(),
        id:      el.id || null,
        phase,
        message: err.message,
        stack:   err.stack || null,
        ts:      new Date().toISOString(),
    };
    _errors.push(entry);

    console.error(
        `%c[LdsErrorBoundary] <${entry.tag}> crashed in "${phase}"`,
        'color:#f44336;font-weight:bold;',
        '\nError:', err,
        '\nElement:', el,
        '\nFull log: window.__LDS_ERRORS__'
    );

    _tryAutoPost(entry);
    return entry;
}

function _restoreMethod(el, name, patch) {
    if (!patch) return;
    if (patch.hadOwn) el[name] = patch.original;
    else delete el[name];
}

function attach(el) {
    if (el.__ldsEBPatched) return;
    el.__ldsEBPatched = true;

    // Lit: performUpdate() drives all rendering
    if (typeof el.performUpdate === 'function') {
        const patch = {
            hadOwn: Object.prototype.hasOwnProperty.call(el, 'performUpdate'),
            original: el.performUpdate,
        };
        el.__ldsEBPatch = patch;
        el.performUpdate = function (...args) {
            if (el.__ldsErrored) return undefined;
            try {
                return patch.original.apply(this, args);
            } catch (e) {
                el.__ldsErrored = true;
                el.isComponentErrored = true;
                _record(el, e, 'render');
                _injectFallback(el, e);
                return undefined;
            }
        };
    }
}

function detach(el) {
    if (el.__ldsFallback) {
        el.__ldsFallback.remove();
        delete el.__ldsFallback;
    }
    _restoreMethod(el, 'performUpdate', el.__ldsEBPatch);
    delete el.__ldsEBPatch;
    delete el.__ldsEBPatched;
    delete el.__ldsErrored;
}

const LdsErrorBoundary = { attach, detach };
export { LdsErrorBoundary };
