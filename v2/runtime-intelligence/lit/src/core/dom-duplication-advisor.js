import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

const SINGLETON_ROLES = Object.freeze(['dialog', 'tooltip', 'alertdialog', 'menu']);
const SINGLETON_PATTERNS = Object.freeze([
    'modal', 'dialog', 'overlay', 'tooltip', 'popup', 'drawer', 'flyout', 'sheet',
]);

class DomDuplicationAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #minInstances;
    #mutationObserver = null;
    #debounceId = null;
    #DEBOUNCE_MS = 300;

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        minInstances = 3,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('DomDuplicationAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#minInstances = minInstances;
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
        return this;
    }

    scan() { this.#scanOnce(); }

    #scheduleScan() {
        if (this.#debounceId != null) clearTimeout(this.#debounceId);
        this.#debounceId = setTimeout(() => { this.#debounceId = null; this.#scanOnce(); }, this.#DEBOUNCE_MS);
    }

    #scanOnce() {
        if (!this.#active && this.#windowTarget) return;
        const doc = this.#windowTarget?.document;
        if (!doc) return;

        try {
            const all = doc.querySelectorAll('*');
            const byTag = new Map();

            for (const el of all) {
                if (!this.#isSingletonElement(el)) continue;
                const tag = el.localName;
                if (!byTag.has(tag)) byTag.set(tag, []);
                byTag.get(tag).push(el);
            }

            for (const [tag, elements] of byTag) {
                if (elements.length < this.#minInstances) continue;
                const ancestor = this.#findLowestCommonAncestor(elements);
                const ancestorTag = ancestor?.localName || 'body';
                const identicalContent = this.#identicalContentSignal(elements);
                const strength = identicalContent ? 'high' : 'medium';

                this.#store.emit({
                    type: RuntimeEventType.DIAGNOSTIC,
                    owner: null,
                    correlation: { causedByEventId: null },
                    evidence: {
                        level: EvidenceLevel.OBSERVATION,
                        attribution: AttributionQuality.HEURISTIC,
                        confidence: identicalContent ? 0.7 : 0.5,
                    },
                    payload: {
                        domDuplication: true,
                        duplicateTag: tag,
                        instanceCount: elements.length,
                        commonAncestorTag: ancestorTag,
                        identicalContent,
                        strength,
                    },
                });
            }
        } catch (_) {
            // never throw from a scan
        }
    }

    #isSingletonElement(el) {
        const role = el.getAttribute?.('role');
        if (role && SINGLETON_ROLES.includes(role)) return true;
        const tag = el.localName;
        if (!tag.includes('-')) return false;
        return SINGLETON_PATTERNS.some(p => tag.includes(p));
    }

    #findLowestCommonAncestor(elements) {
        if (elements.length === 0) return null;
        const ShadowRootCtor = this.#windowTarget?.ShadowRoot ??
            (typeof ShadowRoot !== 'undefined' ? ShadowRoot : null);

        function ancestorChain(el) {
            const chain = [];
            let cur = el;
            let hops = 0;
            while (cur && hops < 100) {
                try {
                    const root = cur.getRootNode?.();
                    if (ShadowRootCtor && root instanceof ShadowRootCtor) {
                        cur = root.host;
                    } else {
                        cur = cur.parentElement;
                    }
                } catch (_) {
                    cur = cur.parentElement;
                }
                if (cur) chain.push(cur);
                hops++;
            }
            return chain;
        }

        const firstChain = ancestorChain(elements[0]);
        for (const ancestor of firstChain) {
            if (elements.every(el => ancestor.contains(el))) return ancestor;
        }
        return null;
    }

    #identicalContentSignal(elements) {
        if (elements.length < 2) return false;
        try {
            const lengths = elements.map(el => el.innerHTML?.length ?? 0);
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            if (min === 0) return false;
            return (max - min) / min <= 0.10;
        } catch (_) {
            return false;
        }
    }
}

export { DomDuplicationAdvisor };
