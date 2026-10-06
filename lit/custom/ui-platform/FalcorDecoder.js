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

// ── Extended path analysis ─────────────────────────────────────────────────

function _extractDataIndex(url) {
    if (!url) return null;
    const m = url.match(/\/data\/([^./?#]+)\.json/);
    return m ? m[1] : null;
}

function _analyzePathsExtended(paths) {
    if (!Array.isArray(paths) || !paths.length) {
        return { pathCount: 0, entityTypes: [], entityIds: [], fields: [], isSearch: false, searchRequestId: null, isBatchGet: false };
    }
    const pathCount    = paths.length;
    const isBatchGet   = pathCount > 1;
    const entityTypeSet = new Set();
    const entityIdSet   = new Set();
    const fieldSet      = new Set();
    let isSearch        = false;
    let searchRequestId = null;

    for (const path of paths) {
        if (!Array.isArray(path)) continue;

        // Detect search patterns: [..., "searchResults", "create"] or [..., "searchResults", requestId, ...]
        const srIdx = path.indexOf('searchResults');
        if (srIdx !== -1) {
            isSearch = true;
            const next = path[srIdx + 1];
            if (next && typeof next === 'string' && next !== 'create' && !/^\d+$/.test(next)) {
                searchRequestId = next;
            }
        }

        // Find "byIds" to split entity context from fields
        const byIdsIdx = path.findIndex(seg => seg === 'byIds');
        if (byIdsIdx !== -1) {
            // Segment just before byIds is the entity type
            const typeSeg = path[byIdsIdx - 1];
            if (typeSeg != null) {
                if (Array.isArray(typeSeg)) typeSeg.forEach(t => typeof t === 'string' && entityTypeSet.add(t));
                else if (typeof typeSeg === 'string') entityTypeSet.add(typeSeg);
            }
            // Segment after byIds is entity IDs
            const idSeg = path[byIdsIdx + 1];
            if (idSeg != null) {
                if (Array.isArray(idSeg)) idSeg.slice(0, 50).forEach(id => entityIdSet.add(String(id)));
                else entityIdSet.add(String(idSeg));
            }
            // Remaining segments are fields
            for (let i = byIdsIdx + 2; i < path.length; i++) {
                const seg = path[i];
                if (Array.isArray(seg)) seg.forEach(s => typeof s === 'string' && s !== '*' && fieldSet.add(s));
                else if (typeof seg === 'string' && seg !== '*') fieldSet.add(seg);
            }
        } else if (srIdx === -1) {
            // No byIds and no searchResults — collect middle-segment strings as entity types
            for (let i = 1; i < Math.min(path.length, 4); i++) {
                const seg = path[i];
                if (typeof seg === 'string' && seg.length > 0) entityTypeSet.add(seg);
                else if (Array.isArray(seg)) seg.forEach(s => typeof s === 'string' && entityTypeSet.add(s));
            }
        }
    }

    return {
        pathCount,
        isBatchGet,
        entityTypes:     [...entityTypeSet],
        entityIds:       [...entityIdSet].slice(0, 30),
        fields:          [...fieldSet],
        isSearch,
        searchRequestId,
    };
}

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
                const cpStr = Array.isArray(callPath) ? callPath.join('.') : String(callPath);
                return { method: 'call', callPath: cpStr, callPathArr: Array.isArray(callPath) ? callPath : null, args,
                    pathCount: 0, isBatchGet: false, entityTypes: [], entityIds: [], fields: [],
                    isSearch: cpStr.includes('searchResults'), searchRequestId: null };
            }

            if (method === 'get' || method === 'set') {
                let paths;
                try { paths = JSON.parse(params.paths); } catch (_e) { paths = null; }
                if (paths && Array.isArray(paths) && paths.length > 0) {
                    const firstPath = paths[0];
                    const pathStr   = Array.isArray(firstPath) ? firstPath.join('.') : String(firstPath);
                    const types     = paths.map(p => Array.isArray(p) ? String(p[0]) : String(p));
                    const ext       = _analyzePathsExtended(paths);
                    return { method, callPath: pathStr, callPathArr: Array.isArray(firstPath) ? firstPath : null, types,
                        paths, ...ext };
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
            const ext       = _analyzePathsExtended(paths);
            return { method: 'get', callPath: pathStr, callPathArr: Array.isArray(firstPath) ? firstPath : null, types,
                paths, ...ext };
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

    // Match standard Falcor model.json URLs and Syndigo's /data/*.json endpoints
    const isFalcorUrl = rawUrl.includes('/model.json')
        || rawUrl.includes('falcor')
        || /\/data\/[^/?#]+\.json/.test(rawUrl);
    if (!isFalcorUrl) return null;

    let falcorInfo = null;
    if (body) falcorInfo = _parseFalcorBody(body);
    if (!falcorInfo && rawUrl.includes('model.json')) falcorInfo = _parseFalcorGetUrl(rawUrl);
    if (!falcorInfo) return null;

    const domain     = _extractDomain(falcorInfo.callPath, falcorInfo.callPathArr);
    const appName    = _extractAppName(rawUrl);
    const operation  = _buildOperation(falcorInfo);
    const dataIndex  = _extractDataIndex(rawUrl);

    return {
        protocol:        'falcor',
        method:          falcorInfo.method,
        callPath:        falcorInfo.callPath,
        callPathArr:     falcorInfo.callPathArr || null,
        types:           falcorInfo.types || null,
        args:            falcorInfo.args || null,
        domain,
        appName,
        operation,
        dataIndex,
        paths:           falcorInfo.paths           || null,
        pathCount:       falcorInfo.pathCount        ?? 0,
        isBatchGet:      falcorInfo.isBatchGet       ?? false,
        entityTypes:     falcorInfo.entityTypes      || [],
        entityIds:       falcorInfo.entityIds        || [],
        fields:          falcorInfo.fields           || [],
        isSearch:        falcorInfo.isSearch         ?? false,
        searchRequestId: falcorInfo.searchRequestId  || null,
    };
}

export { decodeFalcor, _parseFalcorBody, _parseFalcorGetUrl };
