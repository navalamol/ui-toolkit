/**
 * NavigationBridge — framework-neutral browser navigation tracker.
 *
 * Emits NAVIGATION events for pushState, replaceState, and popstate.
 * After each navigation, schedules an orphan check: components that were
 * alive before the navigation but never received OWNER_DESTROYED are suspects.
 *
 * Zero imports from any framework adapter — browser-level only.
 */
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from '../../core/evidence-protocol.js';
import { maskUrlQuery } from '../../core/enterprise-privacy.js';

const DEFAULT_ORPHAN_CHECK_DELAY_MS = 5000;

function _sanitizeUrl(href) {
    try {
        return maskUrlQuery(typeof href === 'string' ? href : String(href));
    } catch {
        return '[url-sanitize-error]';
    }
}

class NavigationBridge {
    #store;
    #win;
    #orphanCheckDelayMs;
    #active = false;
    #origPushState = null;
    #origReplaceState = null;
    #popstateListener = null;
    // ownerId → number of navigations survived without being destroyed
    #survivedCounts = new Map();
    #totalOrphansEmitted = 0;

    constructor({ store, windowTarget = typeof window !== 'undefined' ? window : null, orphanCheckDelayMs = DEFAULT_ORPHAN_CHECK_DELAY_MS } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.snapshot !== 'function') {
            throw new TypeError('NavigationBridge requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#win = windowTarget;
        this.#orphanCheckDelayMs = Number.isFinite(orphanCheckDelayMs) && orphanCheckDelayMs >= 0
            ? orphanCheckDelayMs
            : DEFAULT_ORPHAN_CHECK_DELAY_MS;
    }

    start() {
        if (this.#active || !this.#win?.history) return this;
        this.#active = true;

        const history = this.#win.history;
        this.#origPushState = history.pushState.bind(history);
        this.#origReplaceState = history.replaceState.bind(history);

        history.pushState = (state, title, url) => {
            this.#origPushState(state, title, url);
            this.#onNavigation('pushState');
        };

        history.replaceState = (state, title, url) => {
            this.#origReplaceState(state, title, url);
            this.#onNavigation('replaceState');
        };

        this.#popstateListener = () => this.#onNavigation('popstate');
        this.#win.addEventListener('popstate', this.#popstateListener);

        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;

        if (this.#win?.history) {
            if (this.#origPushState) this.#win.history.pushState = this.#origPushState;
            if (this.#origReplaceState) this.#win.history.replaceState = this.#origReplaceState;
        }
        this.#origPushState = null;
        this.#origReplaceState = null;

        if (this.#popstateListener) {
            this.#win?.removeEventListener?.('popstate', this.#popstateListener);
            this.#popstateListener = null;
        }

        return this;
    }

    orphanCount() {
        return this.#totalOrphansEmitted;
    }

    #onNavigation(type) {
        const navTimestamp = Date.now();
        const url = _sanitizeUrl(this.#win?.location?.href ?? '');

        try {
            this.#store.emit({
                type: RuntimeEventType.NAVIGATION,
                owner: null,
                evidence: {
                    level: EvidenceLevel.OBSERVATION,
                    attribution: AttributionQuality.DETERMINISTIC,
                    confidence: 1.0,
                },
                payload: { url, navigationType: type, timestamp: navTimestamp },
            });
        } catch { /* never break navigation */ }

        if (this.#orphanCheckDelayMs === 0) {
            this.#checkOrphans(navTimestamp);
        } else {
            setTimeout(() => this.#checkOrphans(navTimestamp), this.#orphanCheckDelayMs);
        }
    }

    #checkOrphans(navTimestamp) {
        if (!this.#active && this.#orphanCheckDelayMs > 0) return;

        const created = this.#store.snapshot({ type: RuntimeEventType.OWNER_CREATED });
        const destroyed = this.#store.snapshot({ type: RuntimeEventType.OWNER_DESTROYED });

        // Build set of destroyed owner IDs
        const destroyedIds = new Set(destroyed.map(e => e.owner?.id).filter(Boolean));

        // Owners created before the navigation that were never destroyed
        for (const ev of created) {
            const ownerId = ev.owner?.id;
            if (!ownerId) continue;
            // Only consider owners that existed before this navigation
            if ((ev.timestamp ?? 0) > navTimestamp) continue;
            if (destroyedIds.has(ownerId)) {
                // Clean component — reset its survived count
                this.#survivedCounts.delete(ownerId);
                continue;
            }

            const survivedCount = (this.#survivedCounts.get(ownerId) ?? 0) + 1;
            this.#survivedCounts.set(ownerId, survivedCount);
            this.#totalOrphansEmitted += 1;

            try {
                this.#store.emit({
                    type: RuntimeEventType.DIAGNOSTIC,
                    owner: null,
                    evidence: {
                        level: EvidenceLevel.CORRELATION,
                        attribution: AttributionQuality.TEMPORAL_INFERENCE,
                        confidence: 0.6,
                    },
                    payload: {
                        orphanSuspect: true,
                        ownerId,
                        tag: ev.owner?.name ?? ownerId,
                        survivedNavigationCount: survivedCount,
                    },
                });
            } catch { /* never break the app */ }
        }
    }
}

export { NavigationBridge };
