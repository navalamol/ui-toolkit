/**
 * RufErrorBoundary — catches render/update crashes in any ruf-element.
 *
 * Always active: no flag required. Prevents a single broken component from
 * crashing the entire page. Sets `isComponentErrored = true` on the element
 * (already a declared RufElement property) and injects a visible fallback UI.
 *
 * Error log: window.__RUF_ERRORS__          — array of all caught errors
 * Clear log:  window.__RUF_ERRORS__.length = 0
 *
 * R3-D — Auto-POST on crash:
 *   mainApp.globalSettings.rufCrashEndpoint = 'https://support.example.com/ruf-ingest'
 *   mainApp.globalSettings.rufCrashAutoPost = true
 *   When both are set, the full RUF report JSON is POSTed automatically on the
 *   first CRITICAL crash. The customer sees a toast-style banner; support gets
 *   the report without any customer action.
 */

const _errors = [];

if (typeof window !== 'undefined') {
    window.__RUF_ERRORS__ = _errors;
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
        el.__rufFallback = div;
    } catch (_) {
        // If shadow DOM injection fails, the console error is still recorded
    }
}

function _esc(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

let _autoPostFired = false; // only POST once per page load

function _tryAutoPost(entry) {
    if (_autoPostFired) return;
    try {
        const mainApp = window.__ruf_mainApp__ ?? document.getElementById('app')?.__dataHost ?? null;
        const settings = mainApp?.globalSettings;
        if (!settings?.rufCrashAutoPost || !settings?.rufCrashEndpoint) return;

        _autoPostFired = true;
        const endpoint = settings.rufCrashEndpoint;

        // Assemble a lightweight crash report — avoid importing ruf-debug-panel to keep this module lean
        const report = {
            sessionId:  window.__RUF_SESSION_ID__ || null,
            reportTime: new Date().toISOString(),
            triggerError: entry,
            errors:     [..._errors],
            perf:       { ...(window.__RUF_PERF__ || {}) },
            console:    [...(window.__RUF_CONSOLE__ || [])],
            aciTimeline: [...(window.__RUF_ACI_TIMELINE__ || [])],
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
            console.log('%c[RufErrorBoundary] Crash report auto-posted to', 'color:#a6e3a1;font-weight:bold;', endpoint);
            _showCrashBanner();
        }).catch(postErr => {
            console.warn('[RufErrorBoundary] Auto-post failed:', postErr.message);
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
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        phase,
        message: err.message,
        stack: err.stack || null,
        ts: new Date().toISOString(),
    };
    _errors.push(entry);

    console.error(
        `%c[RufErrorBoundary] <${entry.tag}> crashed in "${phase}"`,
        'color:#f44336;font-weight:bold;',
        '\nError:', err,
        '\nElement:', el,
        '\nFull log: window.__RUF_ERRORS__'
    );

    // R3-D: auto-POST if endpoint is configured
    _tryAutoPost(entry);

    return entry;
}

function attach(el) {
    if (el.__rufEBPatched) return;
    el.__rufEBPatched = true;

    // ── Lit: performUpdate() drives all rendering ──────────────────────────
    if (typeof el.performUpdate === 'function') {
        const orig = el.performUpdate.bind(el);
        el.performUpdate = function () {
            if (el.__rufErrored) return; // stop re-render storms after a crash
            try {
                orig();
            } catch (e) {
                el.__rufErrored = true;
                el.isComponentErrored = true;
                _record(el, e, 'render');
                _injectFallback(el, e);
            }
        };
    }

    // ── Polymer: _propertiesChanged() drives updates ───────────────────────
    if (typeof el._propertiesChanged === 'function') {
        const orig = el._propertiesChanged.bind(el);
        el._propertiesChanged = function (current, changed, old) {
            if (el.__rufErrored) return;
            try {
                orig(current, changed, old);
            } catch (e) {
                el.__rufErrored = true;
                el.isComponentErrored = true;
                _record(el, e, 'propertiesChanged');
                _injectFallback(el, e);
            }
        };
    }
}

function detach(el) {
    if (el.__rufFallback) {
        el.__rufFallback.remove();
        delete el.__rufFallback;
    }
    delete el.__rufEBPatched;
    delete el.__rufErrored;
}

const RufErrorBoundary = { attach, detach };
export { RufErrorBoundary };
