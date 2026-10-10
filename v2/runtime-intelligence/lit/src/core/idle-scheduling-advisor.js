import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class IdleSchedulingAdvisor {
    #store;
    #active = false;
    #unsubscribe = null;
    #minUpdateDurationMs;
    #lookbackWindowMs;
    #periodicCountThreshold;
    #periodicMinIntervalMs;
    #ownerHistory = new Map();
    #HISTORY_CAP = 20;

    constructor({
        store,
        minUpdateDurationMs = 16,
        lookbackWindowMs = 500,
        periodicCountThreshold = 5,
        periodicMinIntervalMs = 2000,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('IdleSchedulingAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#minUpdateDurationMs = minUpdateDurationMs;
        this.#lookbackWindowMs = lookbackWindowMs;
        this.#periodicCountThreshold = periodicCountThreshold;
        this.#periodicMinIntervalMs = periodicMinIntervalMs;
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
        this.#ownerHistory.clear();
        return this;
    }

    #onEvent(event) {
        if (event.type !== RuntimeEventType.UPDATE_COMPLETED) return;
        const durationMs = event.payload?.durationMs;
        if (!Number.isFinite(durationMs) || durationMs < this.#minUpdateDurationMs) return;

        const ownerId = event.owner?.id ?? event.owner ?? null;
        const ownerTag = event.owner?.name ?? event.owner?.id ?? event.payload?.tag ?? ownerId ?? 'unknown';
        const ts = event.timestamp ?? Date.now();

        if (!this.#ownerHistory.has(ownerId)) this.#ownerHistory.set(ownerId, []);
        const history = this.#ownerHistory.get(ownerId);
        history.push({ timestamp: ts, durationMs });
        if (history.length > this.#HISTORY_CAP) history.shift();

        if (this.#hasRecentInteraction(ts)) return;

        const isPeriodic = this.#isPeriodicPattern(ownerId, ts);
        if (!isPeriodic && durationMs < this.#minUpdateDurationMs * 2) return;

        const trigger = isPeriodic ? 'periodic' : 'non-urgent';
        const strength = durationMs >= 100 || isPeriodic ? 'high' : 'medium';

        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: null,
                correlation: { causedByEventId: null },
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.HEURISTIC,
                    confidence: 0.6,
                },
                payload: {
                    idleOpportunity: true,
                    ownerTag,
                    durationMs: Math.round(durationMs),
                    trigger,
                    strength,
                    ...(isPeriodic ? { updateCountInWindow: history.length } : {}),
                },
            });
        } catch (_) {}
    }

    #hasRecentInteraction(beforeTs) {
        // Uses STATE_CHANGED as interaction proxy.
        // When RuntimeEventType.INTERACTION is wired in the adapter, swap to that.
        try {
            const recent = this.#store.snapshot({ type: RuntimeEventType.STATE_CHANGED }) ?? [];
            return recent.some(e => {
                const ts = e.timestamp ?? 0;
                return ts >= beforeTs - this.#lookbackWindowMs && ts <= beforeTs;
            });
        } catch (_) {
            return false;
        }
    }

    #isPeriodicPattern(ownerId, currentTs) {
        const history = this.#ownerHistory.get(ownerId) ?? [];
        if (history.length < this.#periodicCountThreshold) return false;

        const recents = history.slice(-this.#periodicCountThreshold);
        for (let i = 1; i < recents.length; i++) {
            const gap = recents[i].timestamp - recents[i - 1].timestamp;
            if (gap < this.#periodicMinIntervalMs) return false;
        }
        return true;
    }
}

export { IdleSchedulingAdvisor };
