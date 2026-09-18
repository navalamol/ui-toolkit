/**
 * RufSlowApiMonitor — annotates slow DataObjectManager calls with a visible badge.
 *
 * Enable:    window.__RUF_SLOW_API__ = true
 * Threshold: window.__RUF_SLOW_API_MS__ = 2000   (default: 2000ms)
 * Log only (no badge): window.__RUF_SLOW_API_SILENT__ = true
 *
 * A yellow "⏱ Xms" badge appears on the component that initiated a slow call.
 * Clicking the badge logs the full request + response to the console.
 * Badge auto-removes after 8 seconds.
 *
 * All slow calls are also logged to window.__RUF_SLOW_API_LOG__
 */

const _log = [];
let _patched = false;

// Track which element is "active" at dispatch time using a simple call stack.
// Each element sets itself as active at the start of connectedCallback and
// during property-driven updates. This gives best-effort attribution.
let _activeEl = null;
const _setActive = el => { _activeEl = el; };
const _clearActive = () => { _activeEl = null; };

if (typeof window !== 'undefined') {
    window.__RUF_SLOW_API_LOG__ = _log;

    window.__RUF_SLOW_API_REPORT__ = function () {
        if (!_log.length) {
            console.log('%c[SlowApi] No slow calls recorded yet', 'color:#f57c00;font-weight:bold;');
            return [];
        }
        const rows = _log.map(e => ({
            ts: e.ts,
            'ms': e.ms,
            method: e.method,
            component: e.tag || '?',
            operation: e.operation,
            status: e.status,
        }));
        console.log('%c[SlowApi] Slow API Calls', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };
}

const _BADGE_CSS = [
    'position:absolute',
    'top:4px',
    'right:4px',
    'z-index:2147483646',
    'background:#f57c00',
    'color:#fff',
    'border:none',
    'border-radius:3px',
    'padding:2px 6px',
    'font-size:11px',
    'font-family:monospace',
    'cursor:pointer',
    'pointer-events:auto',
    'white-space:nowrap',
    'box-shadow:0 1px 4px rgba(0,0,0,0.3)',
].join(';');

function _showBadge(el, entry) {
    if (!el || window.__RUF_SLOW_API_SILENT__) return;
    try {
        // Ensure the element has relative positioning so absolute badge aligns to it
        const computed = getComputedStyle(el);
        if (computed.position === 'static') el.style.position = 'relative';

        const badge = document.createElement('button');
        badge.style.cssText = _BADGE_CSS;
        badge.textContent = `⏱ ${entry.ms}ms`;
        badge.title = `Slow API: ${entry.operation} — click for details`;

        badge.addEventListener('click', e => {
            e.stopPropagation();
            console.groupCollapsed(
                `%c[SlowApi] ${entry.tag || 'unknown'} — ${entry.ms}ms — ${entry.operation}`,
                'color:#f57c00;font-weight:bold;'
            );
            console.log('Method:', entry.method);
            console.log('Request:', entry.request);
            console.log('Response:', entry.response);
            console.log('Full entry:', entry);
            console.groupEnd();
        });

        const root = el.shadowRoot || el;
        root.appendChild(badge);

        // Auto-remove badge after 8 seconds
        setTimeout(() => {
            if (badge.parentNode) badge.remove();
        }, 8000);
    } catch (_) {}
}

function _extractOperation(args) {
    // Best-effort: pull a meaningful operation name from the request args
    try {
        const req = args[0];
        if (typeof req === 'string') return req.split('/').filter(Boolean).slice(-2).join('/');
        if (req && req.entity && req.entity.type) return req.entity.type;
        if (req && req.params && req.params.query && req.params.query.filters) {
            const f = req.params.query.filters;
            return f.typesCriteria ? f.typesCriteria.join(',') : 'query';
        }
        if (req && req.url) return req.url.split('/').filter(Boolean).slice(-1)[0];
    } catch (_) {}
    return 'unknown';
}

function _wrapMethod(dom, method) {
    const orig = dom[method];
    if (!orig || orig.__rufSlowApiWrapped) return;

    dom[method] = function (...args) {
        if (!window.__RUF_SLOW_API__) return orig.apply(this, args);

        const t0 = performance.now();
        const tag = _activeEl ? _activeEl.tagName.toLowerCase() : null;
        const capturedEl = _activeEl; // capture at call time
        const operation = _extractOperation(args);

        const result = orig.apply(this, args);

        const threshold = window.__RUF_SLOW_API_MS__ || 2000;

        if (result && typeof result.then === 'function') {
            result.then(response => {
                const ms = Math.round(performance.now() - t0);
                if (ms < threshold) return;

                const entry = {
                    ts: new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 3 }),
                    ms,
                    method,
                    tag,
                    operation,
                    request: args[0],
                    response,
                    status: response && response.response && response.response.status,
                };
                _log.push(entry);
                if (_log.length > 100) _log.shift();

                console.warn(
                    `%c[SlowApi] ${ms}ms — ${method}("${operation}") on <${tag || '?'}>`,
                    'color:#f57c00;font-weight:bold;',
                    '\nRequest:', args[0],
                    '\nFull log: window.__RUF_SLOW_API_LOG__'
                );

                if (capturedEl) _showBadge(capturedEl, entry);
            });
        }

        return result;
    };

    dom[method].__rufSlowApiWrapped = true;
}

// Lazy patch — DataObjectManager may not be loaded at module import time
function _patchDataObjectManager() {
    if (_patched) return;
    try {
        // DataObjectManager is a singleton loaded via ui-platform-dataaccess.
        // We reach it via the global registry if available, otherwise skip.
        const dom = window.__dataObjectManager__ ||
            (window.RUFUtilities && window.RUFUtilities.dataObjectManager);
        if (!dom) return;

        ['get', 'post', 'rest', 'initiateRequest'].forEach(m => _wrapMethod(dom, m));
        _patched = true;
    } catch (_) {}
}

function attach(el) {
    // Track active element for call attribution
    const origConnected = el.connectedCallback;

    // Mark element active during its own API calls by exposing setters
    // that components can call (best-effort; no changes needed to rock-* elements)
    el.__rufSetApiContext = () => _setActive(el);
    el.__rufClearApiContext = () => _clearActive();

    // Attempt to patch DataObjectManager on first element connect
    _patchDataObjectManager();

    // Also set this element as briefly active so any synchronous API calls
    // triggered during connectedCallback are attributed correctly
    _setActive(el);
    // Clear after the microtask queue drains (async calls may not be attributed,
    // but sync / immediate calls during connect will be)
    Promise.resolve().then(() => {
        if (_activeEl === el) _clearActive();
    });
}

function detach(el) {
    delete el.__rufSetApiContext;
    delete el.__rufClearApiContext;
    if (_activeEl === el) _clearActive();
}

const RufSlowApiMonitor = { attach, detach };
export { RufSlowApiMonitor };
