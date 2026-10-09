/**
 * NetworkStateCorrelator — framework-neutral.
 *
 * Watches the evidence store for NETWORK_COMPLETED events. For each one it opens
 * a short correlation window. Any STATE_CHANGED event arriving within that window
 * gets a DIAGNOSTIC linking the two with a shared traceId, so EvidenceGraph builds
 * TRACE_CONTEXT edges automatically. UREP events are immutable — the DIAGNOSTIC is
 * the correlation record, not a mutation.
 *
 * Zero imports from any framework adapter.
 */
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from '../../core/evidence-protocol.js';

const DEFAULT_WINDOW_MS = 500;
const DEFAULT_MAX_PENDING = 20;

class NetworkStateCorrelator {
    #store;
    #windowMs;
    #maxPending;
    #pending = []; // [{ traceId, networkEventId, expiresAt, path, method, networkTimestamp }]
    #unsubscribe = null;
    #active = false;
    #linkCount = 0;

    constructor({
        store,
        correlationWindowMs = DEFAULT_WINDOW_MS,
        maxPendingCorrelations = DEFAULT_MAX_PENDING,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('NetworkStateCorrelator requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowMs = Number.isFinite(correlationWindowMs) && correlationWindowMs > 0
            ? correlationWindowMs
            : DEFAULT_WINDOW_MS;
        this.#maxPending = Number.isFinite(maxPendingCorrelations) && maxPendingCorrelations > 0
            ? Math.floor(maxPendingCorrelations)
            : DEFAULT_MAX_PENDING;
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
        this.#pending = [];
        return this;
    }

    linkCount() {
        return this.#linkCount;
    }

    #onEvent(event) {
        if (!this.#active) return;
        const now = event.timestamp ?? Date.now();
        this.#evictExpired(now);

        if (event.type === RuntimeEventType.NETWORK_COMPLETED) {
            this.#addPending(event, now);
            return;
        }

        if (event.type === RuntimeEventType.STATE_CHANGED && this.#pending.length > 0) {
            // Correlate with the most-recent non-expired network completion (closest in time)
            const best = this.#bestMatch(now);
            if (!best) return;
            this.#emitLink(best, event, now);
        }
    }

    #addPending(networkEvent, now) {
        const entry = {
            traceId: `net-trace-${networkEvent.id}`,
            networkEventId: networkEvent.id,
            expiresAt: now + this.#windowMs,
            path: networkEvent.payload?.path ?? null,
            method: networkEvent.payload?.method ?? 'GET',
            networkTimestamp: now,
        };
        // Enforce bounded size: drop oldest if full
        if (this.#pending.length >= this.#maxPending) this.#pending.shift();
        this.#pending.push(entry);
    }

    #evictExpired(now) {
        this.#pending = this.#pending.filter(p => p.expiresAt > now);
    }

    #bestMatch(now) {
        // Return the most recent pending correlation (closest to now, not yet expired)
        return this.#pending.length > 0 ? this.#pending[this.#pending.length - 1] : null;
    }

    #emitLink(pending, stateEvent, now) {
        const tracedMs = Math.round(Math.max(0, now - pending.networkTimestamp) * 10) / 10;
        this.#linkCount += 1;
        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: stateEvent.owner ?? null,
                correlation: {
                    causedByEventId: pending.networkEventId,
                    traceId: pending.traceId,
                },
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.TEMPORAL_INFERENCE,
                    confidence: 0.6,
                },
                payload: {
                    networkCorrelation: true,
                    networkEventId: pending.networkEventId,
                    stateEventId: stateEvent.id,
                    stateOwnerId: stateEvent.owner?.id ?? null,
                    stateOwnerTag: stateEvent.owner?.name ?? null,
                    stateProperty: stateEvent.payload?.property ?? null,
                    networkPath: pending.path,
                    networkMethod: pending.method,
                    tracedMs,
                    traceId: pending.traceId,
                },
            });
        } catch { /* never break the app */ }
    }
}

export { NetworkStateCorrelator };
