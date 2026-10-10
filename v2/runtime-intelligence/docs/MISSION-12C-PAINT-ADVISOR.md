# Mission 12C — PaintAdvisor

Status: OPEN

## Pain
Developers see slow LCP/CLS in the Vitals tab but have no visibility into FP/FCP timing or
which CSS properties (filter, backdrop-filter, box-shadow) are forcing expensive GPU layers
on dozens of elements per frame.

## Prerequisite
Missions 12A and 12B must be complete. This mission adds one section to
`panel-opportunities-presentation.js`.

## Deliberately deferred
Layout-thrash detection (correlating layout-shift entries with UPDATE_COMPLETED) is deferred to
Mission 12F. The signal has too many false positives without adapter-level instrumentation.
This mission ships two clean, deterministic sub-detectors: paint timing and expensive CSS.

---

## Existing infrastructure to reuse
- `src/core/vitals.js` — existing `PerformanceObserver` patterns (copy, do not import from there)
- `src/core/dom-duplication-advisor.js` (12A) — lifecycle pattern
- `src/integration/lit/panel-opportunities-presentation.js` — add `_renderPaintAdvisorSection`,
  replace the stub

---

## What to build

### New file: `src/core/paint-advisor.js`

```js
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
    #paintTimingEmitted = new Set();   // 'first-paint' | 'first-contentful-paint' — emit once each
    #CSS_SCAN_CAP = 500;
    #CSS_RESCAN_INTERVAL_MS = 30000;   // re-scan every 30s for late-loading components
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
        this.#scheduleCssScan(0);   // immediate first scan
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

    scanExpensiveCss() { this.#scanExpensiveCssOnce(); }   // public for testing

    // ── Sub-detector (a): Paint timing ─────────────────────────────────────

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
                    metric: entry.name,   // 'first-paint' | 'first-contentful-paint'
                    valueMs: Math.round(entry.startTime),
                },
            });
        } catch (_) {}
    }

    // ── Sub-detector (b): Expensive CSS ────────────────────────────────────

    #scheduleCssScan(delayMs = 0) {
        const win = this.#windowTarget;
        const schedule = win?.requestIdleCallback
            ? (fn) => win.requestIdleCallback(fn, { timeout: 5000 })
            : (fn) => setTimeout(fn, delayMs);
        this.#cssTimeoutId = schedule(() => {
            this.#cssTimeoutId = null;
            this.#scanExpensiveCssOnce();
            // Schedule periodic re-scan
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
                // For transform, only flag expensive 3D/perspective transforms
                if (prop === 'transform' && !EXPENSIVE_TRANSFORM_RE.test(val)) continue;
                if (!byProp[prop]) byProp[prop] = { count: 0, exampleTag: el.localName };
                byProp[prop].count++;
            }
        } catch (_) {}
    }
}

export { PaintAdvisor };
```

---

### Modify: `src/integration/lit/panel-opportunities-presentation.js`

Replace stub:
```js
function _renderPaintAdvisorSection(_target) { return ''; }
```

With:
```js
function _renderPaintAdvisorSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const all = store.snapshot?.({ type: 'diagnostic' }) ?? [];

    const timings = all.filter(e => e.payload?.paintTiming === true)
        .reduce((acc, e) => { acc[e.payload.metric] = e.payload.valueMs; return acc; }, {});
    const cssHits = all.filter(e => e.payload?.expensivePaint === true);

    if (!Object.keys(timings).length && !cssHits.length) return '';

    function _paintColor(ms) {
        if (ms < 1800) return '#a6e3a1';   // green
        if (ms < 3000) return '#f9e2af';   // yellow
        return '#f38ba8';                   // red
    }

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #fab387;border-radius:7px;padding:8px 10px;" open>
            <summary style="cursor:pointer;color:#fab387;font-weight:700;">🎨 Paint Analysis</summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">

                ${Object.keys(timings).length ? html`
                    <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        ${timings['first-paint'] != null ? html`
                            <span style="margin-right:12px;">First Paint:
                                <strong style="color:${_paintColor(timings['first-paint'])};">${timings['first-paint']}ms</strong>
                            </span>` : ''}
                        ${timings['first-contentful-paint'] != null ? html`
                            <span>FCP:
                                <strong style="color:${_paintColor(timings['first-contentful-paint'])};">${timings['first-contentful-paint']}ms</strong>
                            </span>` : ''}
                        <div style="color:#6c7086;margin-top:2px;font-size:10px;">
                            Good &lt;1800ms · Needs improvement &lt;3000ms · Poor ≥3000ms
                        </div>
                    </div>
                ` : ''}

                ${cssHits.map(h => html`
                    <div style="margin-bottom:6px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div>Expensive CSS · <code style="color:#fab387;">${h.payload.property}</code>
                        on ${h.payload.elementCount} elements
                        <span style="color:#6c7086;margin-left:4px;">(e.g. <code>&lt;${h.payload.exampleTag}&gt;</code>)</span></div>
                        <div style="margin-top:3px;color:#6c7086;">
                            → Limit to &lt;10 elements. Apply <code style="color:#a6e3a1;">will-change:transform</code> only on actively-animating elements.
                        </div>
                    </div>
                `)}
            </div>
        </details>
    `;
}
```

---

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

```js
import { PaintAdvisor } from '../../core/paint-advisor.js';
// field:
#paintAdvisor = null;
// constructor:
this.#paintAdvisor = new PaintAdvisor({ store, windowTarget });
// start(): this.#paintAdvisor?.start();
// stop(): this.#paintAdvisor?.stop();
// #onEvidence():
if (p?.paintTiming || p?.expensivePaint) { this.#dispatchPanelUpdate(); return; }
// accessor:
get paintAdvisor() { return this.#paintAdvisor ?? null; }
```

### Modify: `src/panel/LdsDebugPanel.js`

```js
// Expensive Paint
const expensivePaintDiags = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.expensivePaint === true)
    : [];
for (const d of expensivePaintDiags) {
    const p = d.payload;
    issues.push({
        id: `paint-css-${p.property}`,
        component: p.exampleTag || '(multiple)',
        filePath: _tagToFilePath(p.exampleTag || ''),
        issueType: 'expensive-paint',
        severity: p.elementCount > 30 ? 'high' : 'medium',
        details: `${p.elementCount} elements use CSS property "${p.property}" which forces expensive GPU layer painting.`,
        callStacks: [],
        recommendation: `Reduce "${p.property}" usage to fewer than 10 elements. Apply will-change:transform sparingly — only on elements that animate continuously.`,
        observed: { property: p.property, elementCount: p.elementCount },
    });
}

// Slow FCP
const fcpDiag = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .find(e => e.payload?.paintTiming === true && e.payload?.metric === 'first-contentful-paint' && e.payload?.valueMs > 3000)
    : null;
if (fcpDiag) {
    issues.push({
        id: 'paint-fcp-slow',
        component: '(page load)',
        filePath: '',
        issueType: 'paint-timing',
        severity: 'high',
        details: `First Contentful Paint is ${fcpDiag.payload.valueMs}ms (good threshold: <1800ms).`,
        callStacks: [],
        recommendation: 'Defer non-critical CSS, eliminate render-blocking resources, and reduce server response time.',
        observed: { metric: 'first-contentful-paint', valueMs: fcpDiag.payload.valueMs },
    });
}
```

### Modify: `src/index.js`
```js
export { PaintAdvisor } from './core/paint-advisor.js';
```

---

## Constraints
- MUST NOT monkey-patch `Element.prototype.getBoundingClientRect` or any global prototype
- `getComputedStyle` scan MUST use `requestIdleCallback` when available
- CSS scan MUST cap at 500 elements to avoid causing the perf issue being analyzed
- `paintTiming` MUST emit each metric name only once per session (`#paintTimingEmitted` Set)
- `buffered: true` in `PerformanceObserver.observe()` to capture FCP emitted before tool loads

---

## Tests (exact assertions)

File: `test/unit/paint-advisor.test.mjs`

Fake windowTarget with mock `PerformanceObserver`, `requestIdleCallback`, `getComputedStyle`, `querySelectorAll`.

1. **`scanExpensiveCss()` with no expensive CSS → no expensivePaint DIAGNOSTIC**
   ```
   All elements getComputedStyle returns 'none' for all EXPENSIVE_CSS_PROPS
   → no expensivePaint DIAGNOSTIC
   ```

2. **`scanExpensiveCss()` with >= threshold elements having 'filter' → emits expensivePaint**
   ```
   10 elements with getComputedStyle('filter') = 'blur(4px)' (threshold default = 10)
   → DIAGNOSTIC with expensivePaint:true, property:'filter', elementCount:10
   ```

3. **Paint observer callback with 'first-contentful-paint' entry → emits paintTiming**
   ```
   Fake PerformanceObserver callback called with entry {name:'first-contentful-paint', startTime:1240}
   → DIAGNOSTIC with paintTiming:true, metric:'first-contentful-paint', valueMs:1240
   ```

4. **paintTiming emits only once per metric (dedup)**
   ```
   Observer callback called twice with same metric name 'first-paint'
   → exactly 1 DIAGNOSTIC emitted for that metric
   ```

5. **stop() → no further DIAGNOSTICs**
   ```
   advisor.start(); advisor.stop(); advisor.scanExpensiveCss();
   → store has no new expensivePaint DIAGNOSTIC after stop
   ```

---

## Framework extension path
`PaintAdvisor` depends only on `PerformanceObserver`, `window.getComputedStyle`, and the evidence
store — zero framework coupling. Identically wired in React/Vue pipelines.

---

## Gate checklist
- [ ] All existing + 12A + 12B tests pass
- [ ] 5 new tests in `paint-advisor.test.mjs` pass
- [ ] Paint section appears in Opportunities tab when triggered
- [ ] FCP color-coding: green <1800ms, yellow <3000ms, red ≥3000ms
- [ ] `PaintAdvisor` exported from `src/index.js`
- [ ] Feature doc: `docs/features/15-paint-advisor.md`
