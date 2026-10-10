import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class WorkerOpportunityAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #longTaskThresholdMs;
    #networkSizeThresholdBytes;
    #correlationWindowMs;
    #dedupeWindowMs;
    #observer = null;
    #networkUnsub = null;
    #recentLargeNetworkEvents = [];
    #emittedUrls = new Map();

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        longTaskThresholdMs = 80,
        networkSizeThresholdBytes = 102400,
        correlationWindowMs = 500,
        dedupeWindowMs = 60000,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('WorkerOpportunityAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#longTaskThresholdMs = longTaskThresholdMs;
        this.#networkSizeThresholdBytes = networkSizeThresholdBytes;
        this.#correlationWindowMs = correlationWindowMs;
        this.#dedupeWindowMs = dedupeWindowMs;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;

        this.#networkUnsub = this.#store.subscribe(event => {
            if (event.type !== RuntimeEventType.NETWORK_COMPLETED) return;
            const sizeBytes = event.payload?.responseSize ?? 0;
            if (sizeBytes < this.#networkSizeThresholdBytes) return;
            if (this.#recentLargeNetworkEvents.length >= 50) this.#recentLargeNetworkEvents.shift();
            this.#recentLargeNetworkEvents.push({
                url: event.payload?.url ?? '',
                responseSizeBytes: sizeBytes,
                completedAtMs: this.#now(),
            });
        });

        const win = this.#windowTarget;
        if (win?.PerformanceObserver) {
            try {
                this.#observer = new win.PerformanceObserver(list => this.#onLongTaskEntries(list));
                this.#observer.observe({ entryTypes: ['longtask'] });
            } catch (_) {}
        }

        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#observer) { this.#observer.disconnect(); this.#observer = null; }
        if (this.#networkUnsub) { this.#networkUnsub(); this.#networkUnsub = null; }
        this.#recentLargeNetworkEvents.length = 0;
        this.#emittedUrls.clear();
        return this;
    }

    #now() {
        const win = this.#windowTarget;
        return win?.performance?.timeOrigin != null
            ? win.performance.timeOrigin + (win.performance.now?.() ?? 0)
            : Date.now();
    }

    #onLongTaskEntries(list) {
        if (!this.#active) return;
        for (const entry of list.getEntries()) {
            if (entry.duration >= this.#longTaskThresholdMs) this.#processLongTask(entry);
        }
    }

    #processLongTask(entry) {
        const win = this.#windowTarget;
        const taskStartMs = (win?.performance?.timeOrigin ?? 0) + entry.startTime;

        const attribution = entry.attribution?.[0];
        const scriptUrl = attribution?.containerSrc || '';
        const isThirdParty = scriptUrl
            ? !scriptUrl.startsWith(win?.location?.origin ?? '___NO_MATCH___')
            : false;

        const networkTrigger = this.#findNetworkTrigger(taskStartMs);
        const trigger = networkTrigger ? 'large-network-response' : 'longtask-only';
        const now = Date.now();

        if (this.#shouldDedup(scriptUrl, now)) return;
        this.#emittedUrls.set(scriptUrl, now);

        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: null,
                correlation: { causedByEventId: null },
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.TEMPORAL_INFERENCE,
                    confidence: networkTrigger ? 0.6 : 0.4,
                },
                payload: {
                    workerOpportunity: true,
                    durationMs: Math.round(entry.duration),
                    scriptUrl,
                    isThirdParty,
                    trigger,
                    ...(networkTrigger ? {
                        networkResponseKB: Math.round(networkTrigger.responseSizeBytes / 1024),
                        networkUrl: networkTrigger.url,
                    } : {}),
                    strength: entry.duration >= 150 ? 'high' : 'medium',
                },
            });
        } catch (_) {}
    }

    #findNetworkTrigger(taskStartMs) {
        for (const evt of [...this.#recentLargeNetworkEvents].reverse()) {
            const gap = taskStartMs - evt.completedAtMs;
            if (gap >= 0 && gap <= this.#correlationWindowMs) return evt;
        }
        return null;
    }

    #shouldDedup(scriptUrl, now) {
        const last = this.#emittedUrls.get(scriptUrl);
        return last != null && now - last < this.#dedupeWindowMs;
    }
}

export { WorkerOpportunityAdvisor };
