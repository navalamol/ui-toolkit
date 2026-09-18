/**
 * FalcorDecoder — Syndigo-specific protocol decoder for the LDS network tool.
 *
 * Extracted verbatim from ruf-network.js. Decodes Falcor GET + POST requests
 * into human-readable operation descriptors.
 *
 * Register with LdsNetwork:
 *   import { decodeFalcor } from 'lit-debug-suite/custom/ui-platform';
 *   import { LdsNetwork } from 'lit-debug-suite';
 *   LdsNetwork.registerDecoder(decodeFalcor);
 *
 * This file must stay in custom/ui-platform/ — it has no place in the generic core.
 */

// ── POST body parsing ──────────────────────────────────────────────────────

function _parseFalcorBody(body) {
    if (!body) return null;
    try {
        let raw = decodeURIComponent(body.replace(/\+/g, ' '));
        if (raw.startsWith('callPath=') || raw.startsWith('arguments=') || raw.startsWith('paths=') || raw.startsWith('method=')) {
            const params = {};
            raw.split('&').forEach(part => {
                const eq = part.indexOf('=');
                if (eq === -1) return;
                const k = part.slice(0, eq);
                const v = part.slice(eq + 1);
                params[k] = v;
            });

            const method = params.method || (params.callPath ? 'call' : params.paths ? 'get' : null);
            if (!method) return null;

            if (method === 'call') {
                let callPath;
                try { callPath = JSON.parse(params.callPath); } catch (_e) { callPath = params.callPath; }
                let args;
                try { args = params.arguments ? JSON.parse(params.arguments) : []; } catch (_e) { args = []; }
                return { method: 'call', callPath: Array.isArray(callPath) ? callPath.join('.') : String(callPath), callPathArr: Array.isArray(callPath) ? callPath : null, args };
            }

            if (method === 'get' || method === 'set') {
                let paths;
                try { paths = JSON.parse(params.paths); } catch (_e) { paths = null; }
                if (paths && Array.isArray(paths) && paths.length > 0) {
                    const firstPath = paths[0];
                    const pathStr   = Array.isArray(firstPath) ? firstPath.join('.') : String(firstPath);
                    const types     = paths.map(p => Array.isArray(p) ? String(p[0]) : String(p));
                    return { method, callPath: pathStr, callPathArr: Array.isArray(firstPath) ? firstPath : null, types };
                }
            }

            return { method, callPath: params.callPath || params.paths || '?' };
        }
    } catch (_e) {}
    return null;
}

// ── GET URL parsing ────────────────────────────────────────────────────────

function _parseFalcorGetUrl(url) {
    if (!url) return null;
    try {
        const match = url.match(/\/model\.json\?paths=(.+?)(?:&|$)/);
        if (!match) {
            const modelMatch = url.match(/\/model\.json/);
            if (modelMatch) return { method: 'get', callPath: '?' };
            return null;
        }
        const pathsRaw = decodeURIComponent(match[1]);
        let paths;
        try { paths = JSON.parse(pathsRaw); } catch (_e) { paths = null; }
        if (paths && Array.isArray(paths) && paths.length > 0) {
            const firstPath = paths[0];
            const pathStr   = Array.isArray(firstPath) ? firstPath.join('.') : String(firstPath);
            const types     = paths.map(p => Array.isArray(p) ? String(p[0]) : String(p));
            return { method: 'get', callPath: pathStr, callPathArr: Array.isArray(firstPath) ? firstPath : null, types };
        }
        return { method: 'get', callPath: pathsRaw.slice(0, 80) };
    } catch (_e) {
        return null;
    }
}

// ── Domain extraction ──────────────────────────────────────────────────────

function _extractDomain(callPath, callPathArr) {
    if (!callPath && !callPathArr) return null;
    const arr = callPathArr || callPath.split('.');
    if (!arr.length) return null;
    const root = String(arr[0]);
    // Domain map — Syndigo dataObject root keys
    const domainMap = {
        entityManage:      'Entity Manage',
        entityModel:       'Entity Model',
        entitySearch:      'Entity Search',
        entityGet:         'Entity Get',
        entityGovernance:  'Governance',
        matchProfile:      'Match Profile',
        configurationGet:  'Configuration',
        entityAppModel:    'App Model',
        referencedata:     'Reference Data',
        uomService:        'UoM',
        binaryStreamObject:'Binary Stream',
        contentTemplate:   'Content Template',
        typeManage:        'Type Manage',
        copService:        'CoP',
        bedrockService:    'Bedrock Service',
    };
    return domainMap[root] || root;
}

// ── App name extraction ────────────────────────────────────────────────────

function _extractAppName(url) {
    const m = url.match(/\/([a-zA-Z0-9_-]+?)\/api\//);
    return m ? m[1] : null;
}

// ── Operation summary ──────────────────────────────────────────────────────

function _buildOperation(falcorInfo) {
    const m = falcorInfo.method;
    if (m === 'call')  return `CALL ${falcorInfo.callPath || ''}`;
    if (m === 'get')   return `GET  ${falcorInfo.callPath || ''}`;
    if (m === 'set')   return `SET  ${falcorInfo.callPath || ''}`;
    return m.toUpperCase();
}

// ── Main decoder ───────────────────────────────────────────────────────────

/**
 * decodeFalcor — decoder function registered with LdsNetwork.registerDecoder().
 *
 * @param {string} rawUrl  — raw request URL
 * @param {string|null} body — POST body string (null for GET)
 * @returns {object|null}  decoded descriptor, or null if not a Falcor request
 */
function decodeFalcor(rawUrl, body) {
    if (!rawUrl) return null;

    // Only attempt on model.json paths
    const isFalcorUrl = rawUrl.includes('/model.json') || rawUrl.includes('falcor');
    if (!isFalcorUrl) return null;

    let falcorInfo = null;
    if (body) falcorInfo = _parseFalcorBody(body);
    if (!falcorInfo && rawUrl.includes('model.json')) falcorInfo = _parseFalcorGetUrl(rawUrl);
    if (!falcorInfo) return null;

    const domain    = _extractDomain(falcorInfo.callPath, falcorInfo.callPathArr);
    const appName   = _extractAppName(rawUrl);
    const operation = _buildOperation(falcorInfo);

    return {
        protocol:    'falcor',
        method:      falcorInfo.method,
        callPath:    falcorInfo.callPath,
        callPathArr: falcorInfo.callPathArr || null,
        types:       falcorInfo.types || null,
        args:        falcorInfo.args || null,
        domain,
        appName,
        operation,
    };
}

export { decodeFalcor, _parseFalcorBody, _parseFalcorGetUrl };
