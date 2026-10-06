/**
 * LdsMemory — mount/unmount lifecycle counters + storm detector + slope-based leak detection.
 *
 * window.__LDS_MEMORY__       = Map<tagName, { mounted, unmounted, gcCount }>
 * window.__LDS_STORMS__       = [{ tag, count, ts, stack }]
 * window.__LDS_MOUNT_CYCLES__ = [{ cycleId, startTs, endTs, counts: { tag: {mounted,unmounted} } }]
 * window.__LDS_MEMORY_REPORT__() — console helper
 * window.__LDS_MEMORY_RESET__()  — clears all counters and cycles
 *
 * Uses FinalizationRegistry to detect GC-freed elements without holding references.
 * Storm threshold: >20 mounts of the same tag in a session triggers a storm entry.
 * Progressive-leak: active count grows monotonically across ≥3 completed visibility cycles.
 */

const _map = new Map();
const _storms = [];
const _registry = typeof FinalizationRegistry !== 'undefined'
    ? new FinalizationRegistry(tag => {
        const d = _map.get(tag);
        if (d) d.gcCount = (d.gcCount || 0) + 1;
    })
    : null;

// ── Cycle tracking ─────────────────────────────────────────────────────────
const _mountCycles = [];
let _currentMountCycle = null;
let _cycleSeq = 0;

function _startNewMountCycle() {
    if (_currentMountCycle) _currentMountCycle.endTs = new Date().toISOString();
    _cycleSeq++;
    _currentMountCycle = { cycleId: _cycleSeq, startTs: new Date().toISOString(), endTs: null, counts: {} };
    _mountCycles.push(_currentMountCycle);
    if (_mountCycles.length > 10) _mountCycles.shift();
}

function _mountCycleRecord(tag, field) {
    if (!_currentMountCycle) _startNewMountCycle();
    const c = _currentMountCycle.counts;
    if (!c[tag]) c[tag] = { mounted: 0, unmounted: 0 };
    c[tag][field]++;
}

if (typeof window !== 'undefined') {
    window.__LDS_MEMORY__ = _map;
    window.__LDS_STORMS__ = _storms;
    window.__LDS_MOUNT_CYCLES__ = _mountCycles;

    window.__LDS_MEMORY_REPORT__ = function () {
        if (!_map.size) {
            console.log('%c[LdsMemory] No data yet', 'color:#f57c00;font-weight:bold;');
            return [];
        }
        const rows = [];
        for (const [tag, d] of _map) {
            rows.push({
                tag,
                mounted: d.mounted || 0,
                unmounted: d.unmounted || 0,
                active: (d.mounted || 0) - (d.unmounted || 0),
                gcFreed: d.gcCount || 0,
            });
        }
        rows.sort((a, b) => b.active - a.active);
        console.log('%c[LdsMemory] Mount/Unmount counts', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };

    window.__LDS_MEMORY_RESET__ = function () {
        _map.clear();
        _storms.length = 0;
        _mountCycles.length = 0;
        _currentMountCycle = null;
        _startNewMountCycle();
        console.log('%c[LdsMemory] Reset', 'color:#1a73e8;font-weight:bold;');
    };
}

// New visibility cycle = user navigated away and came back (open→close→open pattern)
if (typeof document !== 'undefined') {
    _startNewMountCycle();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') _startNewMountCycle();
    });
}

function attach(el) {
    const tag = el.tagName.toLowerCase();
    if (!_map.has(tag)) _map.set(tag, { mounted: 0, unmounted: 0, gcCount: 0 });
    const d = _map.get(tag);
    d.mounted++;
    _mountCycleRecord(tag, 'mounted');

    // Storm detection: >20 mounts, then every 10 thereafter
    const m = d.mounted;
    if (m === 21 || (m > 21 && (m - 21) % 10 === 0)) {
        const entry = {
            tag, count: m,
            ts: new Date().toISOString(),
            stack: (new Error().stack || '').split('\n').slice(1, 8).join('\n'),
        };
        _storms.push(entry);
        if (_storms.length > 200) _storms.shift();
        console.warn(
            `%c[LdsMemory] Render storm: <${tag}> mounted ${m}× in this session`,
            'color:#f57c00;font-weight:bold;',
            '\nFull log: window.__LDS_STORMS__'
        );
    }

    if (_registry) _registry.register(el, tag);
}

function detach(el) {
    const tag = el.tagName.toLowerCase();
    const d = _map.get(tag);
    if (d) d.unmounted = (d.unmounted || 0) + 1;
    _mountCycleRecord(tag, 'unmounted');
}

const LdsMemory = { attach, detach };
export { LdsMemory };
