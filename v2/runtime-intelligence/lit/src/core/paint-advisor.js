import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

const EXPENSIVE_CSS_PROPS = Object.freeze([
    'filter', 'backdropFilter', 'boxShadow', 'webkitFilter',
]);
const EXPENSIVE_TRANSFORM_RE = /matrix3d|perspective\(/;

class PaintAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #cssExpensiveThreshold;
    #paintObserver = null;
    #cssTimeoutId = null;
    #paintTimingEmitted = new Set();
    #CSS_SCAN_CAP = 500;
    #CSS_RESCAN_INTERVAL_MS = 30000;
    #cssRescanId = null;

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        cssExpensiveThreshold = 10,
    } = {}) {
        if (!store || typeof store.emit !== 'function') {
            throw new TypeError('PaintAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#cssExpensiveThreshold = cssExpensiveThreshold;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        this.#initPaintObserver();
        this.#scheduleCssScan(0);
        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#paintObserver) { this.#paintObserver.disconnect(); this.#paintObserver = null; }
        if (this.#cssTimeoutId != null) { clearTimeout(this.#cssTimeoutId); this.#cssTimeoutId = null; }
        if (this.#cssRescanId != null) { clearInterval(this.#cssRescanId); this.#cssRescanId = null; }
        return this;
    }

    scanExpensiveCss() { if (this.#active) this.#scanExpensiveCssOnce(); }

    #initPaintObserver() {
        const win = this.#windowTarget;
        if (!win?.PerformanceObserver) return;
        try {
            this.#paintObserver = new win.PerformanceObserver(list => {
                for (const entry of list.getEntries()) this.#onPaintEntry(entry);
            });
            this.#paintObserver.observe({ entryTypes: ['paint'], buffered: true });
        } catch (_) {}
    }

    #onPaintEntry(entry) {
        if (this.#paintTimingEmitted.has(entry.name)) return;
        this.#paintTimingEmitted.add(entry.name);
        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: null,
                correlation: { causedByEventId: null },
                evidence: {
                    level: EvidenceLevel.OBSERVATION,
                    attribution: AttributionQuality.DETERMINISTIC,
                    confidence: 1.0,
                },
                payload: {
                    paintTiming: true,
                    metric: entry.name,
                    valueMs: Math.round(entry.startTime),
                },
            });
        } catch (_) {}
    }

    #scheduleCssScan(delayMs = 0) {
        const win = this.#windowTarget;
        const schedule = win?.requestIdleCallback
            ? (fn) => win.requestIdleCallback(fn, { timeout: 5000 })
            : (fn) => setTimeout(fn, delayMs);
        this.#cssTimeoutId = schedule(() => {
            this.#cssTimeoutId = null;
            if (!this.#active) return;
            this.#scanExpensiveCssOnce();
            this.#cssRescanId = setInterval(() => {
                if (this.#active) this.#scanExpensiveCssOnce();
            }, this.#CSS_RESCAN_INTERVAL_MS);
        });
    }

    #scanExpensiveCssOnce() {
        const win = this.#windowTarget;
        const doc = win?.document;
        if (!doc) return;

        try {
            const all = [...doc.querySelectorAll('*')].slice(0, this.#CSS_SCAN_CAP);
            const byProp = {};

            for (const el of all) {
                this.#checkComputedStyle(el, byProp);
            }

            for (const [property, { count, exampleTag }] of Object.entries(byProp)) {
                if (count < this.#cssExpensiveThreshold) continue;
                this.#store.emit({
                    type: RuntimeEventType.DIAGNOSTIC,
                    owner: null,
                    correlation: { causedByEventId: null },
                    evidence: {
                        level: EvidenceLevel.OBSERVATION,
                        attribution: AttributionQuality.HEURISTIC,
                        confidence: 0.8,
                    },
                    payload: {
                        expensivePaint: true,
                        property,
                        elementCount: count,
                        exampleTag,
                    },
                });
            }
        } catch (_) {}
    }

    #checkComputedStyle(el, byProp) {
        const win = this.#windowTarget;
        if (!win?.getComputedStyle) return;
        try {
            const style = win.getComputedStyle(el);
            for (const prop of EXPENSIVE_CSS_PROPS) {
                const val = style[prop];
                if (!val || val === 'none' || val === 'normal') continue;
                if (prop === 'transform' && !EXPENSIVE_TRANSFORM_RE.test(val)) continue;
                if (!byProp[prop]) byProp[prop] = { count: 0, exampleTag: el.localName };
                byProp[prop].count++;
            }
        } catch (_) {}
    }
}

export { PaintAdvisor };
