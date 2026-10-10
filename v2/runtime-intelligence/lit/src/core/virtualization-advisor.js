import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class VirtualizationAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #minChildren;
    #offScreenThreshold;
    #mutationObserver = null;
    #debounceId = null;
    #emittedKeys = new Set();
    #DEBOUNCE_MS = 300;
    #MAX_ANCESTOR_HOPS = 20;

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        minChildren = 50,
        offScreenThreshold = 0.7,
    } = {}) {
        if (!store || typeof store.emit !== 'function') {
            throw new TypeError('VirtualizationAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#minChildren = minChildren;
        this.#offScreenThreshold = offScreenThreshold;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        const doc = this.#windowTarget?.document;
        if (doc?.body) {
            this.#mutationObserver = new (this.#windowTarget.MutationObserver)(
                () => this.#scheduleScan()
            );
            this.#mutationObserver.observe(doc.body, { subtree: true, childList: true });
        }
        this.#scanOnce();
        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#mutationObserver) { this.#mutationObserver.disconnect(); this.#mutationObserver = null; }
        if (this.#debounceId != null) { clearTimeout(this.#debounceId); this.#debounceId = null; }
        this.#emittedKeys.clear();
        return this;
    }

    scan() { if (this.#active) this.#scanOnce(); }

    #scheduleScan() {
        if (this.#debounceId != null) clearTimeout(this.#debounceId);
        this.#debounceId = setTimeout(() => { this.#debounceId = null; this.#scanOnce(); }, this.#DEBOUNCE_MS);
    }

    #scanOnce() {
        const doc = this.#windowTarget?.document;
        if (!doc) return;
        this.#emittedKeys.clear();

        try {
            const all = doc.querySelectorAll('*');
            const parentMap = new Map();

            for (const el of all) {
                const parent = el.parentElement;
                if (!parent) continue;
                const childTag = el.localName;
                if (!parentMap.has(parent)) parentMap.set(parent, new Map());
                const tagMap = parentMap.get(parent);
                if (!tagMap.has(childTag)) tagMap.set(childTag, []);
                tagMap.get(childTag).push(el);
            }

            for (const [parent, tagMap] of parentMap) {
                for (const [childTag, children] of tagMap) {
                    if (children.length < this.#minChildren) continue;

                    const offCount = this.#offScreenCount(children);
                    const offRatio = offCount / children.length;
                    if (offRatio < this.#offScreenThreshold) continue;

                    const parentTag = this.#nearestCustomElementAncestor(parent) || parent.localName;
                    const key = `${parentTag}|${childTag}`;
                    if (this.#emittedKeys.has(key)) continue;
                    this.#emittedKeys.add(key);

                    const strength = this.#strengthFor(offRatio, children.length);

                    this.#store.emit({
                        type: RuntimeEventType.DIAGNOSTIC,
                        owner: null,
                        correlation: { causedByEventId: null },
                        evidence: {
                            level: EvidenceLevel.OBSERVATION,
                            attribution: AttributionQuality.HEURISTIC,
                            confidence: 0.7,
                        },
                        payload: {
                            virtualizationOpportunity: true,
                            childTag,
                            childCount: children.length,
                            offScreenRatio: Math.round(offRatio * 100) / 100,
                            parentTag,
                            strength,
                        },
                    });
                }
            }
        } catch (_) {
            // never throw from a scan
        }
    }

    #offScreenCount(elements) {
        const win = this.#windowTarget;
        if (!win) return 0;
        const vH = win.innerHeight ?? 0;
        const vW = win.innerWidth ?? 0;
        let count = 0;
        for (const el of elements) {
            try {
                const r = el.getBoundingClientRect();
                if (r.bottom <= 0 || r.top >= vH || r.right <= 0 || r.left >= vW) count++;
            } catch (_) {
                count++;
            }
        }
        return count;
    }

    #nearestCustomElementAncestor(el) {
        let cur = el;
        let hops = 0;
        while (cur && hops < this.#MAX_ANCESTOR_HOPS) {
            if (cur.localName?.includes('-')) return cur.localName;
            cur = cur.parentElement;
            hops++;
        }
        return null;
    }

    #strengthFor(offRatio, count) {
        if (offRatio >= 0.85 && count >= 100) return 'high';
        if (offRatio >= 0.7 && count >= 50) return 'medium';
        return 'low';
    }
}

export { VirtualizationAdvisor };
