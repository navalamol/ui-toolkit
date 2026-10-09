import {
    AttributionQuality,
    EvidenceLevel,
    RuntimeEventType,
} from '../../core/evidence-protocol.js';
import { parseRuntimeSourceLocation } from '../../core/source-resolver.js';

// Frames to skip when walking the call stack to find the developer's mutation site.
const _SKIP_PATTERNS = [
    'property-watch-manager.js',
    'LitAdapter.js',
    'LitIntelligencePipeline.js',
    'node_modules',
];

function _parseWatchStack(stack) {
    if (typeof stack !== 'string') return null;
    const lines = stack.split('\n').slice(1);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        if (_SKIP_PATTERNS.some(p => line.includes(p))) continue;
        const source = parseRuntimeSourceLocation(line);
        if (source?.file) return source;
    }
    return null;
}

class PropertyWatchManager {
    #adapter;
    #store;
    #watches = new Map(); // `${tagName}:${propName}` → { tagName, propName, threshold, windowMs }
    #mutationTimes = new Map(); // `${ownerId}:${propName}` → number[]
    #alertCount = 0;
    #unsubscribeInterceptor = null;
    #active = false;

    constructor({ adapter, store }) {
        if (!adapter || typeof adapter.addStateChangeInterceptor !== 'function') {
            throw new TypeError('PropertyWatchManager requires an adapter with addStateChangeInterceptor');
        }
        if (!store || typeof store.emit !== 'function') {
            throw new TypeError('PropertyWatchManager requires a store with emit');
        }
        this.#adapter = adapter;
        this.#store = store;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        this.#unsubscribeInterceptor = this.#adapter.addStateChangeInterceptor(
            (el, name, oldValue) => this.#onStateChange(el, name, oldValue)
        );
        return this;
    }

    stop() {
        if (this.#unsubscribeInterceptor) {
            this.#unsubscribeInterceptor();
            this.#unsubscribeInterceptor = null;
        }
        this.#active = false;
        return this;
    }

    /**
     * Watch a reactive property on all elements matching tagName.
     * Returns an unwatch function.
     */
    watch(tagName, propName, { threshold = 3, windowMs = 1000 } = {}) {
        if (!tagName || !propName) return () => {};
        const key = `${String(tagName)}:${String(propName)}`;
        this.#watches.set(key, {
            tagName: String(tagName),
            propName: String(propName),
            threshold: Number.isFinite(threshold) && threshold > 0 ? threshold : 3,
            windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 1000,
        });
        return () => this.unwatch(tagName, propName);
    }

    unwatch(tagName, propName) {
        this.#watches.delete(`${String(tagName)}:${String(propName)}`);
    }

    activeWatches() {
        return [...this.#watches.values()].map(({ tagName, propName }) => ({ tagName, propName }));
    }

    alertCount() {
        return this.#alertCount;
    }

    #onStateChange(el, name, oldValue) {
        // Fast path — do nothing when no watches registered
        if (!name || this.#watches.size === 0) return;

        const tag = el?.localName || el?.tagName?.toLowerCase?.() || el?.constructor?.name;
        if (!tag) return;

        const watchKey = `${tag}:${name}`;
        const watch = this.#watches.get(watchKey);
        if (!watch) return;

        const owner = this.#adapter.ownerOf(el);
        if (!owner) return;

        // Capture call stack at the mutation point
        const source = _parseWatchStack(new Error().stack);

        // Emit enriched STATE_CHANGED with call-stack source
        this.#store.emit({
            type: RuntimeEventType.STATE_CHANGED,
            owner,
            source,
            evidence: {
                level: EvidenceLevel.ATTRIBUTION,
                attribution: source ? AttributionQuality.SOURCE_ATTRIBUTED : AttributionQuality.FRAMEWORK_REPORTED,
                confidence: source ? 0.95 : 0.85,
            },
            payload: {
                property: String(name),
                watchSource: true,
            },
        });

        // Rolling threshold detection
        const countKey = `${owner.id}:${name}`;
        const now = Date.now();
        const times = this.#mutationTimes.get(countKey) || [];
        const windowTimes = times.filter(t => now - t < watch.windowMs);
        windowTimes.push(now);
        this.#mutationTimes.set(countKey, windowTimes);

        if (windowTimes.length > watch.threshold) {
            this.#alertCount += 1;
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner,
                source,
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.FRAMEWORK_REPORTED,
                    confidence: 0.8,
                },
                payload: {
                    watchAlert: true,
                    property: String(name),
                    mutationCount: windowTimes.length,
                    windowMs: watch.windowMs,
                    threshold: watch.threshold,
                },
            });
        }
    }
}

export { PropertyWatchManager };
