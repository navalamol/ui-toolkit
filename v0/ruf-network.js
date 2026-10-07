/**
 * RufNetwork — intercepts window.fetch and XMLHttpRequest.
 * Page-level tool: call RufNetwork.init() once.
 *
 * window.__RUF_NETWORK_LOG__ = [
 *   { url, method, status, durationMs, responseSizeKB, ts, isError, isSlow, isLarge, type, falcor?, error? }
 * ]
 * Capped at 200 entries. Oldest entries are dropped first.
 *
 * Falcor support — two request shapes are decoded automatically:
 *
 *   POST form-encoded (call/set):
 *     method=call&callPath=["root","entityData",...]&arguments=[{params,...}]&pathSuffixes=[]&paths=[]
 *
 *   GET with paths in query string (/data/*.json):
 *     /data/entityData.json?paths=[["root","entityData","referenceData","cachedSearchResults",
 *       "{\"params\":{...},\"domain\":\"referenceData\",\"operation\":\"initiatesearch\"}",
 *       ["maxRecords","requestId"]]]&method=get
 *     The embedded JSON-string segment carries params, domain, operation.
 *
 *   Both produce the same decoded falcor field:
 *     { method, callPath, callPathArr, operation, domain, types, appName,
 *       options, sort, filters, valueContexts, pathSuffixes, paths, fields? }
 *   This gives the Network tab full query visibility — entity types, pagination
 *   window, sort keys, locale context, and the raw Falcor path segments.
 */

const SLOW_MS     = 2000;
const LARGE_KB    = 512;
const MAX_ENTRIES = 200;

const _log = [];
let _initialized = false;

function _push(entry) {
    _log.push(entry);
    if (_log.length > MAX_ENTRIES) _log.shift();
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

// ── Falcor body parser ────────────────────────────────────────────────────────
// Syndigo Falcor model routes receive application/x-www-form-urlencoded bodies.
// We decode every meaningful field so the panel can display full query intent.
function _parseFalcorBody(body) {
    if (!body || typeof body !== 'string') return null;
    if (!body.includes('callPath=')) return null;
    try {
        const params       = new URLSearchParams(body);
        const falcorMethod = params.get('method'); // 'call' | 'get' | 'set'
        if (!falcorMethod) return null;

        const callPathArr  = (() => { try { return JSON.parse(params.get('callPath') || '[]'); } catch { return []; } })();
        const args         = (() => { try { return JSON.parse(params.get('arguments') || '[]'); } catch { return []; } })();
        const pathSuffixes = (() => { try { return JSON.parse(params.get('pathSuffixes') || '[]'); } catch { return []; } })();
        const paths        = (() => { try { return JSON.parse(params.get('paths') || '[]'); } catch { return []; } })();

        const arg0    = (Array.isArray(args) && args[0]) || {};
        const params0 = arg0.params || {};
        const query   = params0.query || {};
        const filters = query.filters || {};

        const callPath = Array.isArray(callPathArr) ? callPathArr.join('.') : String(callPathArr);

        // Extract sort key(s) in readable form: [{field: 'createdate', dir: '_DESC', type: '_DATETIME'}]
        const sort = (() => {
            const rawSort = params0.sort;
            if (!rawSort || !rawSort.attributes) return null;
            return rawSort.attributes.map(a => {
                const entries = Object.entries(a).filter(([k]) => k !== 'sortType');
                const [[field, dir] = []] = entries;
                return { field: field || '?', dir: dir || '?', type: a.sortType || null };
            });
        })();

        // Normalize filters — keep typesCriterion separate for quick display
        const filterKeys = Object.keys(filters);
        const extraFilters = filterKeys.length > 1
            ? Object.fromEntries(filterKeys.filter(k => k !== 'typesCriterion').map(k => [k, filters[k]]))
            : null;

        return {
            method:        falcorMethod,
            callPath,
            callPathArr,
            operation:     arg0.operation     || null,
            domain:        arg0.domain        || null,
            types:         filters.typesCriterion || null,
            appName:       params0.appName    || null,
            options:       params0.options    || null,   // {from, to, maxRecords}
            sort,
            filters:       extraFilters,
            valueContexts: query.valueContexts || null,
            pathSuffixes:  pathSuffixes.length  ? pathSuffixes  : null,
            paths:         paths.length         ? paths         : null,
        };
    } catch {
        return null;
    }
}

// ── Falcor GET parser ─────────────────────────────────────────────────────────
// Handles GET requests to /data/*.json where paths=[...] is in the query string.
// The path array embeds a JSON-serialised params object as one of its segments.
//
// Example URL: /data/entityData.json?paths=[["root","entityData","referenceData",
//   "cachedSearchResults","{\"params\":{...},\"domain\":\"referenceData\",...}",
//   ["maxRecords","requestId"]]]&method=get
function _parseFalcorGetUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    if (rawUrl.indexOf('/data/') === -1) return null;
    try {
        var u         = new URL(String(rawUrl), location.href);
        var pathsRaw  = u.searchParams.get('paths');
        if (!pathsRaw) return null;

        var pathsArr  = JSON.parse(pathsRaw);
        if (!Array.isArray(pathsArr) || !pathsArr.length) return null;

        var firstPath = pathsArr[0];
        if (!Array.isArray(firstPath)) return null;

        // Locate the JSON-encoded params string inside the path segments
        var parsedInner = null;
        var paramIdx    = -1;
        for (var i = 0; i < firstPath.length; i++) {
            if (typeof firstPath[i] === 'string' && firstPath[i].charAt(0) === '{') {
                try {
                    parsedInner = JSON.parse(firstPath[i]);
                    paramIdx    = i;
                    break;
                } catch (_e2) { /* not JSON, skip */ }
            }
        }

        // callPathArr = path strings before the embedded JSON params
        var callPathArr = [];
        var limit       = paramIdx !== -1 ? paramIdx : firstPath.length;
        for (var j = 0; j < limit; j++) {
            if (typeof firstPath[j] === 'string') callPathArr.push(firstPath[j]);
        }

        // Trailing array = requested field suffixes (e.g. ["maxRecords","requestId"])
        var lastSeg     = firstPath[firstPath.length - 1];
        var pathSuffixes = Array.isArray(lastSeg) ? lastSeg : null;

        var innerParams  = (parsedInner && parsedInner.params) || {};
        var query        = innerParams.query || {};
        var filters      = query.filters    || {};

        var sort = null;
        if (innerParams.sort && innerParams.sort.attributes) {
            sort = innerParams.sort.attributes.map(function (a) {
                var entries = Object.keys(a).filter(function (k) { return k !== 'sortType'; });
                var field   = entries[0] || '?';
                return { field: field, dir: a[field] || '?', type: a.sortType || null };
            });
        }

        var filterKeys   = Object.keys(filters);
        var extraFilters = filterKeys.length > 1
            ? (function () {
                var out = {};
                filterKeys.filter(function (k) { return k !== 'typesCriterion'; })
                    .forEach(function (k) { out[k] = filters[k]; });
                return out;
            }())
            : null;

        return {
            method:        'get',
            callPath:      callPathArr.join('.'),
            callPathArr:   callPathArr,
            operation:     (parsedInner && parsedInner.operation) || null,
            domain:        (parsedInner && parsedInner.domain)    || null,
            types:         filters.typesCriterion                  || null,
            appName:       innerParams.appName                     || null,
            options:       innerParams.options                     || null,
            sort:          sort,
            filters:       extraFilters,
            valueContexts: query.valueContexts                     || null,
            fields:        innerParams.fields                      || null,
            pathSuffixes:  pathSuffixes ? [pathSuffixes]           : null,
            paths:         pathsArr,
        };
    } catch (_e) {
        return null;
    }
}

// Resolve Falcor metadata: try POST body first, then GET URL query
function _resolveFalcor(rawUrl, body) {
    return _parseFalcorBody(body) || _parseFalcorGetUrl(rawUrl);
}

function init() {
    if (_initialized || typeof window === 'undefined') return;
    _initialized = true;
    window.__RUF_NETWORK_LOG__ = _log;

    // ── Patch fetch ──────────────────────────────────────────────────────────
    const _origFetch = window.fetch;
    window.fetch = function (...args) {
        const rawUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        const method = (args[1]?.method || 'GET').toUpperCase();
        const body   = typeof args[1]?.body === 'string' ? args[1].body : null;
        const t0     = performance.now();

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
                    falcor:         _resolveFalcor(rawUrl, body),
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
                    falcor:         _resolveFalcor(rawUrl, body),
                    error:          err?.message || 'Network error',
                });
                throw err;
            }
        );
    };

    // ── Patch XHR ────────────────────────────────────────────────────────────
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__ruf_method = method;
        this.__ruf_url    = url;
        return _origOpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        this.__ruf_body = typeof args[0] === 'string' ? args[0] : null;
        const t0 = performance.now();
        this.addEventListener('loadend', () => {
            const ms = Math.round(performance.now() - t0);
            const kb = Math.round(
                parseInt(this.getResponseHeader?.('content-length') || '0', 10) / 1024
            );
            _push({
                url:            _shortUrl(this.__ruf_url || ''),
                fullUrl:        String(this.__ruf_url || ''),
                method:         (this.__ruf_method || 'GET').toUpperCase(),
                status:         this.status,
                durationMs:     ms,
                responseSizeKB: kb || null,
                ts:             new Date().toISOString(),
                isError:        this.status === 0 || this.status >= 400,
                isSlow:         ms > SLOW_MS,
                isLarge:        kb > LARGE_KB,
                type:           'xhr',
                falcor:         _resolveFalcor(this.__ruf_url || '', this.__ruf_body),
            });
        });
        return _origSend.apply(this, args);
    };
}

function detach() {} // page-level, no per-element cleanup

const RufNetwork = { init, detach };
export { RufNetwork };
