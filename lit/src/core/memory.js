/**
 * LdsMemory — mount/unmount lifecycle counters + storm detector + slope-based leak detection
 *             + resource lifetime model (Phase 9).
 *
 * window.__LDS_MEMORY__              = Map<tagName, { mounted, unmounted, gcCount }>
 * window.__LDS_STORMS__              = [{ tag, count, ts, stack }]
 * window.__LDS_MOUNT_CYCLES__        = [{ cycleId, startTs, endTs, counts: { tag: {mounted,unmounted} } }]
 * window.__LDS_RESOURCE_VIOLATIONS__ = [{ ownerId, ownerTag, instanceNum, resources[], detectedAt }]
 * window.__LDS_MEMORY_REPORT__()     — console helper
 * window.__LDS_MEMORY_RESET__()      — clears all counters and cycles
 * window.__LDS_RESOURCE_VIOLATIONS_RESET__() — clears violation log and ledger
 *
 * Phase 9 activation:  window.__LDS_RESOURCE_TRACKER__ = true
 * Suppression:         window.__LDS_SUPPRESS_EVENTS__  = ['resize', ...]  (skip specific event types)
 *
 * Uses FinalizationRegistry to detect GC-freed elements without holding references.
 * Storm threshold: >20 mounts of the same tag in a session triggers a storm entry.
 * Progressive-leak: active count grows monotonically across ≥3 completed visibility cycles.
 */

import { _toolEnabled } from './gate.js';

const _map = new Map();
const _storms = [];
const _registry = typeof FinalizationRegistry !== 'undefined'
    ? new FinalizationRegistry(tag => {
        const d = _map.get(tag);
        if (d) d.gcCount = (d.gcCount || 0) + 1;
    })
    : null;

// ── Cycle tracking (Phase 7) ───────────────────────────────────────────────
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

// ── Resource Ledger (Phase 9) ──────────────────────────────────────────────
const _ledger       = new Map();     // ownerId → resource[]
const _violations   = [];            // [{ ownerId, ownerTag, instanceNum, resources, detectedAt }]
const _listenerMap  = new WeakMap(); // fn → { resourceId, ownerId }
const _elementIds   = new WeakMap(); // el → instanceId
let   _instanceSeq  = 0;
let   _resourceSeq  = 0;
let   _currentOwner = null;
let   _globalPatched = false;

function _getInstanceId(el) {
    if (!_elementIds.has(el)) _elementIds.set(el, ++_instanceSeq);
    return _elementIds.get(el);
}

function _registerListener(owner, eventType, target, fn, stack) {
    const ownerId    = _getInstanceId(owner);
    const id = `rl${++_resourceSeq}`;
    const entry = {
        id, type: 'event-listener', eventType,
        target,
        ownerId, ownerTag: owner.tagName?.toLowerCase() || '(unknown)', instanceNum: ownerId,
        createdAt: new Date().toISOString(), disposedAt: null,
        creationStack: stack || '',
    };
    if (!_ledger.has(ownerId)) _ledger.set(ownerId, []);
    _ledger.get(ownerId).push(entry);
    if (fn && typeof fn === 'function') _listenerMap.set(fn, { resourceId: id, ownerId });
    return id;
}

function _disposeListener(fn) {
    const info = _listenerMap.get(fn);
    if (!info) return;
    const resources = _ledger.get(info.ownerId) || [];
    const res = resources.find(r => r.id === info.resourceId);
    if (res && !res.disposedAt) res.disposedAt = new Date().toISOString();
}

function _suppressedEvents() {
    const s = typeof window !== 'undefined' && window.__LDS_SUPPRESS_EVENTS__;
    return Array.isArray(s) ? s : ['mousemove', 'pointermove', 'touchmove', 'scroll', 'wheel', 'mouseenter', 'mouseleave'];
}

function _patchGlobalListeners() {
    if (_globalPatched || typeof window === 'undefined') return;
    _globalPatched = true;

    const _wrap = (target, targetName) => {
        const origAdd = target.addEventListener.bind(target);
        const origRem = target.removeEventListener.bind(target);
        target.addEventListener = function (type, fn, opts) {
            if (_currentOwner && fn && typeof fn === 'function' && !_suppressedEvents().includes(type)) {
                _registerListener(_currentOwner, type, targetName, fn, new Error().stack);
            }
            return origAdd(type, fn, opts);
        };
        target.removeEventListener = function (type, fn, opts) {
            if (fn && typeof fn === 'function') _disposeListener(fn);
            return origRem(type, fn, opts);
        };
    };

    _wrap(window, 'window');
    _wrap(document, 'document');
}

if (typeof window !== 'undefined') {
    window.__LDS_MEMORY__ = _map;
    window.__LDS_STORMS__ = _storms;
    window.__LDS_MOUNT_CYCLES__ = _mountCycles;
    window.__LDS_RESOURCE_VIOLATIONS__ = _violations;

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

    window.__LDS_RESOURCE_VIOLATIONS_RESET__ = function () {
        _violations.length = 0;
        _ledger.clear();
        console.log('%c[LdsMemory] Resource violations reset', 'color:#1a73e8;font-weight:bold;');
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

    // Resource tracking (Phase 9)
    if (_toolEnabled('resourceTracker')) {
        _patchGlobalListeners();
        _currentOwner = el;
        if (typeof queueMicrotask !== 'undefined') {
            queueMicrotask(() => { if (_currentOwner === el) _currentOwner = null; });
        }
        // Patch per-element addEventListener/removeEventListener (catches this.addEventListener)
        if (el.addEventListener && !el.__ldsAddPatched) {
            const origAdd = el.addEventListener.bind(el);
            const origRem = el.removeEventListener.bind(el);
            el.__ldsAddPatched = true;
            el.addEventListener = function (type, fn, opts) {
                if (fn && typeof fn === 'function' && !_suppressedEvents().includes(type)) {
                    _registerListener(el, type, 'self', fn, new Error().stack);
                }
                return origAdd(type, fn, opts);
            };
            el.removeEventListener = function (type, fn, opts) {
                if (fn && typeof fn === 'function') _disposeListener(fn);
                return origRem(type, fn, opts);
            };
        }
    }

    if (_registry) _registry.register(el, tag);
}

function detach(el) {
    const tag = el.tagName.toLowerCase();
    const d = _map.get(tag);
    if (d) d.unmounted = (d.unmounted || 0) + 1;
    _mountCycleRecord(tag, 'unmounted');

    // Lifetime violation check (Phase 9)
    if (_toolEnabled('resourceTracker')) {
        const ownerId   = _getInstanceId(el);
        const entries   = _ledger.get(ownerId) || [];
        const surviving = entries.filter(e => !e.disposedAt);
        if (surviving.length > 0) {
            const v = { ownerId, ownerTag: tag, instanceNum: ownerId, resources: surviving, detectedAt: new Date().toISOString() };
            _violations.push(v);
            if (_violations.length > 100) _violations.shift();
            console.warn(
                `%c[LdsMemory] lifetime-violation: <${tag}> (instance #${ownerId}) disconnected with ${surviving.length} unreleased resource(s)`,
                'color:#f38ba8;font-weight:bold;',
                surviving.map(r => `  ${r.eventType} on ${r.target}`).join('\n'),
                '\nDetails: window.__LDS_RESOURCE_VIOLATIONS__'
            );
        }
        _ledger.delete(ownerId);
        if (el.__ldsAddPatched) {
            delete el.__ldsAddPatched;
            delete el.addEventListener;
            delete el.removeEventListener;
        }
    }
}

const LdsMemory = { attach, detach };
export { LdsMemory };
