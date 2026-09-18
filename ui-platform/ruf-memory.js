/**
 * RufMemoryMonitor — tracks component lifecycle counts to surface memory leaks.
 *
 * Uses WeakRef + FinalizationRegistry (Chrome 84+) so GC'd elements are detected
 * without holding strong references. Gracefully degrades on older runtimes.
 *
 * Report:  window.__RUF_MEMORY_REPORT__()
 * Raw:     window.__RUF_MEMORY__
 *
 * A component is a "possible leak" if its active count (mounted - unmounted) stays
 * elevated after navigating away from the page that rendered it.
 * Call the report AFTER navigation for the most accurate picture.
 */

// tag → { mounted, unmounted, gcCount }
const _stats = new Map();
const _storms = [];

// FinalizationRegistry fires a callback when a registered object is GC'd.
// We use it to confirm that disconnected elements were actually released.
let _gcRegistry = null;
if (typeof FinalizationRegistry !== 'undefined') {
    _gcRegistry = new FinalizationRegistry(tag => {
        const s = _stats.get(tag);
        if (s) s.gcCount++;
    });
}

if (typeof window !== 'undefined') {
    window.__RUF_MEMORY__ = _stats;
    window.__RUF_STORMS__ = _storms;

    window.__RUF_MEMORY_REPORT__ = function () {
        if (!_stats.size) {
            console.log('%c[RufMemory] No data yet — components mount/unmount data is collected automatically', 'color:#f57c00;font-weight:bold;');
            return [];
        }

        const rows = [];
        _stats.forEach((s, tag) => {
            const active = s.mounted - s.unmounted;
            // GC count tells us how many were actually freed. If active > 0 but
            // gcCount is also growing, those are genuinely released; if gcCount is
            // zero for a long time and active keeps growing, that's a leak.
            const suspectLeak = active > 3 && s.gcCount < active * 0.5;
            rows.push({
                tag,
                mounted: s.mounted,
                unmounted: s.unmounted,
                'active (est)': active,
                'gc freed': s.gcCount,
                status: suspectLeak ? '⚠️ possible leak' : '✅',
            });
        });

        rows.sort((a, b) => b['active (est)'] - a['active (est)']);

        const leaks = rows.filter(r => r.status.startsWith('⚠️'));
        if (leaks.length) {
            console.warn(
                `%c[RufMemory] ${leaks.length} component(s) may be leaking — call window.__RUF_MEMORY_REPORT__() after navigating away for confirmation`,
                'color:#f44336;font-weight:bold;'
            );
        }

        console.log('%c[RufMemory] Component Lifecycle Report', 'color:#1a73e8;font-weight:bold;font-size:14px;');
        console.table(rows);
        return rows;
    };

    window.__RUF_MEMORY_RESET__ = function () {
        _stats.clear();
        console.log('%c[RufMemory] Reset', 'color:#1a73e8;font-weight:bold;');
    };
}

function attach(el) {
    const tag = el.tagName.toLowerCase();

    if (!_stats.has(tag)) {
        _stats.set(tag, { mounted: 0, unmounted: 0, gcCount: 0 });
    }
    const s = _stats.get(tag);
    s.mounted++;

    // Storm detection: flag at 21 and every 10 mounts thereafter
    if (s.mounted > 20 && (s.mounted === 21 || s.mounted % 10 === 0)) {
        _storms.push({ tag, count: s.mounted, ts: new Date().toISOString(), stack: new Error().stack });
        if (_storms.length > 50) _storms.shift();
    }

    if (_gcRegistry) {
        _gcRegistry.register(el, tag);
    }
}

function detach(el) {
    const s = _stats.get(el.tagName.toLowerCase());
    if (s) s.unmounted++;
}

const RufMemoryMonitor = { attach, detach };
export { RufMemoryMonitor };
