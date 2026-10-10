/**
 * LdsNetwork — intercepts window.fetch and XMLHttpRequest.
 * Page-level tool: call LdsNetwork.init() once.
 *
 * window.__LDS_NETWORK_LOG__ = [
 *   { url, method, status, durationMs, responseSizeKB, ts, isError, isSlow, isLarge, type, decoded?, error? }
 * ]
 * Capped at 200 entries.
 *
 * Protocol decoder plugin:
 *   LdsNetwork.registerDecoder(fn)
 *   fn(rawUrl: string, body: string|null) → decodedObject | null
 *
 * Syndigo registers FalcorDecoder via custom/ui-platform/index.js.
 * The decoded object is stored in the log entry's `decoded` field.
 */

const SLOW_MS     = 2000;
const LARGE_KB    = 512;
const MAX_ENTRIES = 200;

const _log = [];
const _subscribers = new Set();
let _initialized = false;
let _decoder = null;

function registerDecoder(fn) {
    _decoder = fn;
}

function subscribe(fn) {
    if (typeof fn !== 'function') throw new TypeError('LdsNetwork.subscribe requires a function');
    _subscribers.add(fn);
    return () => _subscribers.delete(fn);
}

function _push(entry) {
    _log.push(entry);
    if (_log.length > MAX_ENTRIES) _log.shift();
    for (const subscriber of _subscribers) {
        try { subscriber(entry); } catch { /* diagnostics must never break network runtime */ }
    }
}

function _shortUrl(raw) {
    try {
        const u  = new URL(String(raw), location.href);
        const qs = u.search.length > 60 ? u.search.slice(0, 60) + '…' : u.search;
        return u.pathname + qs;
    } catch {
        return String(raw).slice(0, 100);
    }
}

function _resolveDecoded(rawUrl, body) {
    if (!_decoder) return null;
    try { return _decoder(rawUrl, body); } catch (_) { return null; }
}

function init() {
    if (_initialized || typeof window === 'undefined') return;
    _initialized = true;
    window.__LDS_NETWORK_LOG__ = _log;

    // ── Patch fetch ──────────────────────────────────────────────────────────
    const _origFetch = window.fetch;
    window.fetch = function (...args) {
        const rawUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const method = (args[1]?.method || 'GET').toUpperCase();
        const body   = typeof args[1]?.body === 'string' ? args[1].body : null;
        const t0     = performance.now();
        // Capture call stack synchronously at fetch() call site (before async).
        // Any active LDS debug flag enables capture — not just __LDS_FALCOR_VIEW__.
        const callStack = (window.__LDS_DEBUG__ || window.__LDS_FALCOR_VIEW__ || window.__LDS_INTELLIGENCE_ENABLED__)
            ? new Error().stack : undefined;

        return _origFetch.apply(this, args).then(
            response => {
                const ms = Math.round(performance.now() - t0);
                const kb = Math.round(parseInt(response.headers.get('content-length') || '0', 10) / 1024);
                _push({
                    url:            _shortUrl(rawUrl),
                    fullUrl:        String(rawUrl),
                    method,
                    status:         response.status,
                    durationMs:     ms,
                    responseSizeKB: kb || null,
                    ts:             new Date().toISOString(),
                    isError:        response.status >= 400,
                    isSlow:         ms > SLOW_MS,
                    isLarge:        kb > LARGE_KB,
                    type:           'fetch',
                    decoded:        _resolveDecoded(rawUrl, body),
                    callStack,
                });
                return response;
            },
            err => {
                _push({
                    url:            _shortUrl(rawUrl),
                    fullUrl:        String(rawUrl),
                    method,
                    status:         0,
                    durationMs:     Math.round(performance.now() - t0),
                    responseSizeKB: null,
                    ts:             new Date().toISOString(),
                    isError:        true,
                    isSlow:         false,
                    isLarge:        false,
                    type:           'fetch',
                    decoded:        _resolveDecoded(rawUrl, body),
                    error:          err?.message || 'Network error',
                    callStack,
                });
                throw err;
            }
        );
    };

    // ── Patch XHR ────────────────────────────────────────────────────────────
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__lds_method = method;
        this.__lds_url    = url;
        return _origOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        this.__lds_body = typeof args[0] === 'string' ? args[0] : null;
        const t0 = performance.now();
        this.addEventListener('loadend', () => {
            const ms = Math.round(performance.now() - t0);
            const kb = Math.round(
                parseInt(this.getResponseHeader?.('content-length') || '0', 10) / 1024
            );
            _push({
                url:            _shortUrl(this.__lds_url || ''),
                fullUrl:        String(this.__lds_url || ''),
                method:         (this.__lds_method || 'GET').toUpperCase(),
                status:         this.status,
                durationMs:     ms,
                responseSizeKB: kb || null,
                ts:             new Date().toISOString(),
                isError:        this.status === 0 || this.status >= 400,
                isSlow:         ms > SLOW_MS,
                isLarge:        kb > LARGE_KB,
                type:           'xhr',
                decoded:        _resolveDecoded(this.__lds_url || '', this.__lds_body),
            });
        });
        return _origSend.apply(this, args);
    };
}

function detach() {} // page-level, no per-element cleanup

const LdsNetwork = { init, detach, registerDecoder, subscribe };
export { LdsNetwork };
