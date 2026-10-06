/**
 * FalcorNetworkEnhancer — pure analysis functions for the Falcor tab.
 *
 * No DOM, no patches. All functions take the network log array
 * (window.__LDS_NETWORK_LOG__) and return structured analysis objects.
 * Only Falcor entries (decoded.protocol === 'falcor') are analysed.
 */

const BURST_WINDOW_MS = 200;

function _falcorEntries(networkLog) {
    if (!Array.isArray(networkLog)) return [];
    return networkLog.filter(n => n.decoded?.protocol === 'falcor');
}

function _tsMs(entry) {
    const t = entry.ts || entry.startTs;
    return t ? new Date(t).getTime() : 0;
}

// ── Burst groups ───────────────────────────────────────────────────────────

/**
 * Groups Falcor calls that fired within BURST_WINDOW_MS of each other.
 * Returns groups sorted newest-first (matching Network tab convention).
 */
export function getBurstGroups(networkLog) {
    const entries = _falcorEntries(networkLog);
    if (!entries.length) return [];

    // Sort by timestamp ascending for grouping
    const sorted = entries.slice().sort((a, b) => _tsMs(a) - _tsMs(b));

    const groups = [];
    let current = null;

    for (const entry of sorted) {
        const ms = _tsMs(entry);
        if (!current || ms - current._lastMs > BURST_WINDOW_MS) {
            if (current) groups.push(_finalizeGroup(current));
            current = { calls: [entry], _startMs: ms, _lastMs: ms, _groupId: groups.length };
        } else {
            current.calls.push(entry);
            current._lastMs = ms;
        }
    }
    if (current) groups.push(_finalizeGroup(current));

    // Reverse so newest group is first
    return groups.reverse();
}

function _finalizeGroup(g) {
    const dataIndexSet  = new Set();
    const entityTypeSet = new Set();
    let totalMs = 0;
    for (const c of g.calls) {
        const dc = c.decoded;
        if (dc?.dataIndex) dataIndexSet.add(dc.dataIndex);
        (dc?.entityTypes || []).forEach(t => entityTypeSet.add(t));
        totalMs += c.durationMs || 0;
    }
    return {
        groupId:     g._groupId,
        startTs:     new Date(g._startMs).toISOString(),
        endTs:       new Date(g._lastMs).toISOString(),
        spanMs:      g._lastMs - g._startMs,
        totalMs,
        calls:       g.calls,
        dataIndexes: [...dataIndexSet],
        entityTypes: [...entityTypeSet],
    };
}

// ── DataIndex groups ───────────────────────────────────────────────────────

/**
 * Groups all Falcor entries by their dataIndex (derived from URL).
 * Returns { entityData: [...], entityGovernData: [...], ... }
 */
export function getDataIndexGroups(networkLog) {
    const entries = _falcorEntries(networkLog);
    const result  = {};
    for (const entry of entries) {
        const di = entry.decoded?.dataIndex || 'unknown';
        if (!result[di]) result[di] = [];
        result[di].push(entry);
    }
    return result;
}

// ── Search sessions ────────────────────────────────────────────────────────

/**
 * Links search-initiate CALL entries to subsequent paginated GET entries
 * that share the same searchRequestId.
 */
export function getSearchSessions(networkLog) {
    const entries = _falcorEntries(networkLog);
    const initCalls = entries.filter(e => e.decoded?.isSearch && e.decoded?.method === 'call');
    const resultGets = entries.filter(e => e.decoded?.isSearch && e.decoded?.method !== 'call' && e.decoded?.searchRequestId);

    return initCalls.map((call, idx) => {
        // Try to match result GETs by searchRequestId in the call's args
        // (the server returns the requestId; here we rely on proximity if no direct match)
        const callTs = _tsMs(call);
        const linked = resultGets.filter(g => {
            // Same dataIndex, initiated after the call
            return g.decoded.dataIndex === call.decoded.dataIndex && _tsMs(g) >= callTs;
        });
        const requestId = linked.length ? linked[0].decoded.searchRequestId : null;
        return {
            sessionId:   idx,
            initiateCall: call,
            resultCalls: requestId ? linked.filter(g => g.decoded.searchRequestId === requestId) : linked.slice(0, 10),
            requestId,
        };
    });
}

// ── Path analytics ─────────────────────────────────────────────────────────

/**
 * Session-wide analytics: call counts, path counts, field frequencies, hot entities.
 */
export function getPathAnalytics(networkLog) {
    const entries = _falcorEntries(networkLog);
    if (!entries.length) return null;

    const entityTypeFreq = {};
    const fieldFreq      = {};
    const entityIdFreq   = {};
    let totalPaths  = 0;
    let totalMs     = 0;
    let largestCall = null;

    for (const entry of entries) {
        const dc = entry.decoded;
        if (!dc) continue;
        const pc = dc.pathCount || 0;
        totalPaths += pc;
        totalMs    += entry.durationMs || 0;

        (dc.entityTypes || []).forEach(t => { entityTypeFreq[t] = (entityTypeFreq[t] || 0) + 1; });
        (dc.fields       || []).forEach(f => { fieldFreq[f]      = (fieldFreq[f]      || 0) + 1; });
        (dc.entityIds    || []).forEach(id=> { entityIdFreq[id]  = (entityIdFreq[id]  || 0) + 1; });

        if (!largestCall || pc > (largestCall.pathCount || 0)) {
            largestCall = { url: entry.url, pathCount: pc, durationMs: entry.durationMs, dataIndex: dc.dataIndex };
        }
    }

    const dataIndexes = new Set(entries.map(e => e.decoded?.dataIndex).filter(Boolean));

    return {
        totalCalls:      entries.length,
        totalPaths,
        totalMs,
        dataIndexCount:  dataIndexes.size,
        avgPathsPerCall: entries.length ? Math.round((totalPaths / entries.length) * 10) / 10 : 0,
        entityTypeFreq:  _sortedFreq(entityTypeFreq),
        fieldFreq:       _sortedFreq(fieldFreq),
        entityIdFreq:    _sortedFreq(entityIdFreq, 20),
        largestCall,
    };
}

function _sortedFreq(freq, limit = 15) {
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});
}

// ── Duplicate paths ────────────────────────────────────────────────────────

/**
 * Detects paths that were requested in more than one separate call (cache miss indicator).
 */
export function getDuplicatePaths(networkLog) {
    const entries = _falcorEntries(networkLog);
    const pathMap = {}; // pathKey -> [entries]

    for (const entry of entries) {
        const paths = entry.decoded?.paths;
        if (!Array.isArray(paths)) continue;
        for (const path of paths) {
            const key = JSON.stringify(path);
            if (!pathMap[key]) pathMap[key] = [];
            pathMap[key].push(entry);
        }
    }

    return Object.entries(pathMap)
        .filter(([, calls]) => calls.length > 1)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([pathKey, calls]) => ({ pathKey, count: calls.length, calls }));
}
