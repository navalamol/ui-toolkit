/**
 * UpdateBudgetMonitor — framework-neutral.
 *
 * Watches the evidence store for UPDATE_COMPLETED events. Per owner it tracks
 * how many updates fire within a rolling window. When the count exceeds the
 * budget it emits a DIAGNOSTIC{budgetViolation:true} with details.
 *
 * Zero imports from any framework adapter.
 */
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

const DEFAULT_BUDGET = Object.freeze({ countPerWindow: 5, windowMs: 100 });

class UpdateBudgetMonitor {
    #store;
    #defaultBudget;
    #tagBudgets = new Map();            // tagName → { countPerWindow, windowMs }
    #windows = new Map();               // ownerId → [{ timestamp }]
    #ownerMeta = new Map();             // ownerId → { tag }
    #violating = new Set();             // ownerIds currently in a violation episode
    #unsubscribe = null;
    #active = false;
    #violationCount = 0;

    constructor({ store, budget = DEFAULT_BUDGET, onViolation } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('UpdateBudgetMonitor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#defaultBudget = _parseBudget(budget) ?? { ...DEFAULT_BUDGET };
        // onViolation callback is optional; kept for external callers
        if (typeof onViolation === 'function') this._onViolation = onViolation;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        this.#unsubscribe = this.#store.subscribe(event => this.#onEvent(event));
        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#unsubscribe) { this.#unsubscribe(); this.#unsubscribe = null; }
        this.#windows.clear();
        this.#violating.clear();
        return this;
    }

    setBudget(tagName, options) {
        if (typeof tagName !== 'string' || !tagName) throw new TypeError('tagName must be a non-empty string');
        const parsed = _parseBudget(options);
        if (!parsed) throw new TypeError('budget options must include countPerWindow and windowMs');
        this.#tagBudgets.set(tagName, parsed);
        return this;
    }

    clearBudgets() {
        this.#tagBudgets.clear();
        return this;
    }

    violationCount() {
        return this.#violationCount;
    }

    #onEvent(event) {
        if (!this.#active || event.type !== RuntimeEventType.UPDATE_COMPLETED) return;
        const ownerId = event.owner?.id;
        if (!ownerId) return;

        const tag = event.owner?.name ?? ownerId;
        this.#ownerMeta.set(ownerId, { tag });

        const budget = this.#tagBudgets.get(tag) ?? this.#defaultBudget;
        const now = event.timestamp ?? Date.now();
        const windowStart = now - budget.windowMs;

        // Maintain rolling window for this owner
        if (!this.#windows.has(ownerId)) this.#windows.set(ownerId, []);
        const entries = this.#windows.get(ownerId);
        entries.push({ timestamp: now });

        // Prune entries outside the window
        const pruned = entries.filter(e => e.timestamp > windowStart);
        this.#windows.set(ownerId, pruned);

        if (pruned.length > budget.countPerWindow) {
            // Emit once per continuous violation episode — skip if already in violation
            if (!this.#violating.has(ownerId)) {
                this.#violating.add(ownerId);
                this.#violationCount += 1;
                const totalMs = pruned.length > 0
                    ? Math.round((pruned[pruned.length - 1].timestamp - pruned[0].timestamp) * 10) / 10
                    : 0;
                this._onViolation?.({ ownerId, tag, updateCount: pruned.length, budget, totalMs });
                try {
                    this.#store.emit({
                        type: RuntimeEventType.DIAGNOSTIC,
                        owner: event.owner,
                        correlation: { causedByEventId: null },
                        evidence: {
                            level: EvidenceLevel.CORRELATION,
                            attribution: AttributionQuality.TEMPORAL_INFERENCE,
                            confidence: 0.7,
                        },
                        payload: {
                            budgetViolation: true,
                            ownerId,
                            tag,
                            updateCount: pruned.length,
                            windowMs: budget.windowMs,
                            countPerWindow: budget.countPerWindow,
                            totalMs,
                        },
                    });
                } catch { /* never break the app */ }
            }
        } else {
            // Recovered from violation — re-arm for next episode
            this.#violating.delete(ownerId);
        }
    }
}

function _parseBudget(options) {
    if (!options || typeof options !== 'object') return null;
    const { countPerWindow, windowMs } = options;
    if (!Number.isFinite(countPerWindow) || countPerWindow < 1) return null;
    if (!Number.isFinite(windowMs) || windowMs <= 0) return null;
    return { countPerWindow: Math.floor(countPerWindow), windowMs };
}

export { UpdateBudgetMonitor };
