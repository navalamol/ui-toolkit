/**
 * RufCycleDetector — detects circular property-update chains between elements.
 *
 * Enable: window.__RUF_CYCLE_DETECT__ = true  (or via master __RUF_DEBUG__ flag)
 * Store:  window.__RUF_CYCLES__  — array of detected cycle events
 *
 * Algorithm:
 *   Patches two lifecycle methods on each Lit element:
 *   1. performUpdate() — marks the element as "currently rendering" so we know
 *      which tag is mid-update when a downstream property change is triggered.
 *   2. requestUpdate(name, oldValue) — checks whether any other element is
 *      currently in its update cycle and, if so, records a directed edge in
 *      the update graph (A → B meaning "A's render triggered B's update").
 *      After recording the edge, runs a DFS to detect if a cycle now exists.
 *
 * A cycle entry looks like:
 *   { path: "pebble-grid → pebble-toolbar → pebble-grid", count, ts, stack }
 *
 * Panel: Pinpoint tab shows circular-update issue type.
 * Console helper: window.__RUF_CYCLES_REPORT__()
 */

if (typeof window !== 'undefined' && !window.__RUF_CYCLES__) {
    window.__RUF_CYCLES__ = [];

    window.__RUF_CYCLES_REPORT__ = function () {
        const c = window.__RUF_CYCLES__ || [];
        if (!c.length) { console.log('%c[CycleDetector] No cycles detected', 'color:#a6e3a1;font-weight:bold;'); return []; }
        console.log(`%c[CycleDetector] ${c.length} cycle(s) detected`, 'color:#f38ba8;font-weight:bold;font-size:14px;');
        console.table(c.map(e => ({ path: e.path, count: e.count, first: e.ts.slice(11, 19) })));
        return c;
    };
}

// Tag → count of instances currently inside performUpdate (async)
const _updatingCounts = new Map();

// Directed update graph: tag → Set<tag>  (rebuilt per-session; cleared on report)
const _updateGraph = new Map();

function _graphEdge(fromTag, toTag) {
    if (fromTag === toTag) return; // self-loop is a thrash concern, not a cycle
    if (!_updateGraph.has(fromTag)) _updateGraph.set(fromTag, new Set());
    _updateGraph.get(fromTag).add(toTag);
}

// DFS from `start` — returns cycle path array if start is reachable from itself
function _findCycle(start) {
    const visited = new Set();
    const path    = [start];

    function dfs(node) {
        for (const next of (_updateGraph.get(node) || [])) {
            if (next === start) return [...path, start];
            if (!visited.has(next)) {
                visited.add(next);
                path.push(next);
                const found = dfs(next);
                if (found) return found;
                path.pop();
            }
        }
        return null;
    }

    return dfs(start);
}

function attach(el) {
    if (el.__rufCyclePatched) return;
    el.__rufCyclePatched = true;

    const tag = el.tagName.toLowerCase();

    // ── 1. performUpdate — track which element is currently rendering ──────
    // performUpdate is async in Lit 3. The try/finally keeps _updatingCounts
    // accurate even when the async portion completes.
    if (typeof el.performUpdate === 'function') {
        const origPerf = el.performUpdate.bind(el);
        el.performUpdate = async function (...args) {
            _updatingCounts.set(tag, (_updatingCounts.get(tag) || 0) + 1);
            try {
                return await origPerf(...args);
            } finally {
                const n = _updatingCounts.get(tag);
                if (n <= 1) _updatingCounts.delete(tag);
                else        _updatingCounts.set(tag, n - 1);
            }
        };
    }

    // ── 2. requestUpdate — detect which element triggered this update ───────
    if (typeof el.requestUpdate === 'function') {
        const origReqUpd = el.requestUpdate.bind(el);
        el.requestUpdate = function (name, oldValue) {
            for (const [updatingTag] of _updatingCounts) {
                if (updatingTag !== tag) {
                    _graphEdge(updatingTag, tag);

                    const cyclePath = _findCycle(tag);
                    if (cyclePath) {
                        const pathStr = cyclePath.join(' → ');
                        const cycles  = window.__RUF_CYCLES__;
                        if (cycles) {
                            const existing = cycles.find(c => c.path === pathStr);
                            if (existing) {
                                existing.count++;
                            } else {
                                cycles.push({
                                    path:  pathStr,
                                    count: 1,
                                    prop:  name != null ? String(name) : null,
                                    ts:    new Date().toISOString(),
                                    stack: (new Error().stack || '').split('\n').slice(1, 7).join('\n'),
                                });
                                if (cycles.length > 100) cycles.shift();
                            }
                        }
                    }
                }
            }
            return origReqUpd(name, oldValue);
        };
    }
}

function detach(el) {
    delete el.__rufCyclePatched;
    // Remove the tag from the updating set in case detach races with an async update
    const tag = el.tagName?.toLowerCase();
    if (tag) _updatingCounts.delete(tag);
}

const RufCycleDetector = { attach, detach };
export { RufCycleDetector };
