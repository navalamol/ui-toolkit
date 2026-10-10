# Plan: Five New Intelligence Advisors (Missions 12A–12E)

## Context

The tool today has basic DOM node counting (>1500 → "consider virtualising") and LCP/INP/CLS web vitals, but five major developer pain points are completely unaddressed:

1. **Which component specifically needs virtualization** — not just a DOM count alarm
2. **Which computation should move to a Web Worker** — no analysis of main-thread offload opportunities
3. **Repeated singleton DOM structures** — modals/tooltips created per item instead of shared at parent level
4. **Non-urgent updates blocking the main thread** — no awareness of idle-schedulable work
5. **Deep paint analysis** — layout thrash, expensive CSS, and FP/FCP timing beyond just LCP

All five follow the established pattern: new `src/core/` advisor → DIAGNOSTIC events to store → rendered section in Intelligence tab → Pinpoint issue entry.

---

## Critical rule from CLAUDE.md

Every mission requires **4 artifacts**: feature doc (`docs/features/`), mission doc (`docs/MISSION-12X-NAME.md`), implementation (`src/`), test suite (`test/unit/`). No mission is done without all four.

---

## Architecture (all five missions share this template)

```
New advisor (src/core/xxx-advisor.js)
  → store.emit({ type: RuntimeEventType.DIAGNOSTIC, payload: { featureFlag: true, ... } })
  → LitIntelligencePipeline.js wires: new XxxAdvisor({ store, windowTarget }), start/stop
  → panel-intelligence-presentation.js: new _renderXxxSection(target) function
  → LdsDebugPanel.js: new Pinpoint issue block in _buildPinpointIssues()
  → src/index.js: barrel export
```

**Lifecycle pattern** (copy from `UpdateBudgetMonitor`):
```js
class XxxAdvisor {
  #store; #active = false; #unsubscribe = null;
  constructor({ store, windowTarget, ...options }) { /* validate store */ }
  start() { if (this.#active) return this; this.#active = true; ...; return this; }
  stop()  { if (!this.#active) return this; this.#active = false; ...; return this; }
}
```

**emit shape** (use existing enums from `evidence-protocol.js`):
```js
store.emit({
  type: RuntimeEventType.DIAGNOSTIC,
  owner: null,
  correlation: { causedByEventId: null },
  evidence: { level: EvidenceLevel.OBSERVATION, attribution: AttributionQuality.HEURISTIC, confidence: 0.65 },
  payload: { featureFlag: true, ...data },
});
```

**Anti-patterns to avoid** (from CLAUDE.md):
- No `Element.prototype` patching — use `PerformanceObserver` + timing correlation instead
- No `causedByEventId` from temporal proximity — use `traceId` → `TRACE_CONTEXT` edges only
- No Lit/framework imports in `src/core/` files
- No writing to `window.__LDS_*` directly — always `store.emit()`

---

## Mission 12A — IdleSchedulingAdvisor

**Pain**: Non-urgent Lit component updates (background refreshes, analytics, prefetch) run on the main thread during critical rendering time. Developers don't know which updates are safe to defer.

**New file**: `src/core/idle-scheduling-advisor.js`

**Class signature**:
```js
class IdleSchedulingAdvisor {
  #store; #active = false; #unsubscribe = null;
  #minUpdateDurationMs = 16;  // one frame
  #lookbackWindowMs = 500;
  #periodicCountThreshold = 5;
  #ownerHistory = new Map();  // ownerId → [{ timestamp, durationMs }]
  
  constructor({ store, minUpdateDurationMs = 16, lookbackWindowMs = 500, periodicCountThreshold = 5 })
  start()  // subscribes to store UPDATE_COMPLETED events, returns this
  stop()   // unsubscribes, clears ownerHistory, returns this
  
  #onEvent(event)              // filters UPDATE_COMPLETED with durationMs >= minUpdateDurationMs
  #hasRecentInteraction(ts)    // store.snapshot({ type: 'state.changed' }) within lookbackWindowMs before ts
  #isPeriodicPattern(ownerId)  // >=periodicCountThreshold non-interaction updates in history
  #emitOpportunity(payload)
}
```

**emit payload**:
```js
{ idleOpportunity: true, ownerTag: 'x-analytics', durationMs: 42,
  trigger: 'periodic' | 'non-urgent', strength: 'high' | 'medium' }
```

Evidence: `EvidenceLevel.CORRELATION` + `AttributionQuality.HEURISTIC` + confidence 0.6

**Dedup**: Only emit once per (ownerId, trigger) combination until a new STATE_CHANGED arrives.

**Panel section** (border `#f9e2af` yellow): "💤 Idle Scheduling Candidates — N non-urgent updates"  
Shows owner tag, duration, trigger. Copy: "Wrap with `requestIdleCallback(fn, {timeout:2000})` or `scheduler.postTask(fn, {priority:'background'})`."

**Pinpoint**: `issueType: 'idle-scheduling-opportunity'`, `severity: 'medium'`

**Tests** (5 minimum):
1. `UPDATE_COMPLETED` durationMs < 16 → no DIAGNOSTIC
2. `UPDATE_COMPLETED` durationMs ≥ 16 + prior `STATE_CHANGED` in window → no DIAGNOSTIC (interaction-triggered)
3. `UPDATE_COMPLETED` durationMs ≥ 16 + no prior `STATE_CHANGED` → emits `idleOpportunity:true`, `trigger:'non-urgent'`
4. ≥5 rapid `UPDATE_COMPLETED` with no interactions for same owner → `trigger:'periodic'`
5. `stop()` → no DIAGNOSTICs after stop even with qualifying events

> **Implement first** — purely store-driven, no browser APIs, no DOM, fully testable in Node.

---

## Mission 12B — WorkerOpportunityAdvisor

**Pain**: Heavy JSON processing, sorting, filtering — developers don't know which long tasks on the main thread are offloadable to a Web Worker.

**New file**: `src/core/worker-opportunity-advisor.js`

**Class signature**:
```js
class WorkerOpportunityAdvisor {
  #store; #windowTarget; #active = false;
  #longTaskThresholdMs = 80;
  #networkSizeThresholdBytes = 102400;  // 100 KB
  #correlationWindowMs = 500;
  #dedupeWindowMs = 60000;
  #observer = null;
  #recentLargeFetches = [];   // [{ url, sizeBytes, completedAt }] capped at 50
  #emittedUrls = new Map();   // scriptUrl → lastEmitTimestamp
  
  constructor({ store, windowTarget, longTaskThresholdMs, networkSizeThresholdBytes, ... })
  start()   // PerformanceObserver('longtask') + reads __LDS_NETWORK_LOG__, returns this
  stop()    // disconnects observer, clears state, returns this
  
  #onLongTaskEntries(list)
  #processLongTask(entry)
  #syncNetworkLog()            // refreshes #recentLargeFetches from window.__LDS_NETWORK_LOG__
  #findNetworkTrigger(taskStartTime)  // checks for large fetch within correlationWindowMs before task
  #shouldDedup(scriptUrl, now)
  #isThirdParty(scriptUrl)
}
```

**emit payload**:
```js
{ workerOpportunity: true, durationMs: 127, scriptUrl: '...', isThirdParty: false,
  trigger: 'large-network-response' | 'longtask-only',
  networkResponseKB: 245,  // only if trigger === 'large-network-response'
  strength: 'high' | 'medium' }
```

Evidence: `EvidenceLevel.CORRELATION` + `AttributionQuality.TEMPORAL_INFERENCE` + confidence 0.55

**Browser note**: `PerformanceLongTaskTiming.attribution` is Chromium-only. Handle empty arrays gracefully — still emit with `scriptUrl: ''` and no network correlation.

**Panel section** (border `#cba6f7` purple): "⚙️ Worker Offload Candidates — N long tasks"  
Shows URL (truncated), duration, trigger. Copy: "Move processing at this URL into a `new Worker(url)` to free the main thread."

**Pinpoint**: `issueType: 'worker-opportunity'`, `severity: 'medium'`

**Tests**: Same 5-test pattern — fake `PerformanceObserver`, fake `windowTarget.__LDS_NETWORK_LOG__`.

---

## Mission 12C — VirtualizationAdvisor

**Pain**: Current tool only says "consider virtualising" at >1500 total DOM nodes. Developers need to know *which* component renders which list, how many items are off-screen, and what to do.

**New file**: `src/core/virtualization-advisor.js`

**Class signature**:
```js
class VirtualizationAdvisor {
  #store; #windowTarget; #active = false;
  #minChildren = 50;
  #offScreenThreshold = 0.7;
  #scanIntervalMs = 5000;
  #intervalId = null;
  #emittedKeys = new Set();  // cleared each scan cycle
  
  constructor({ store, windowTarget, minChildren, offScreenThreshold, scanIntervalMs })
  start()   // immediate scan + interval, returns this
  stop()    // clears interval, returns this
  scan()    // public entry point for testing
  
  #scanOnce()                          // groups DOM children by (parent, childTag)
  #offScreenCount(elements)            // getBoundingClientRect vs viewport
  #nearestCustomElementAncestor(el)    // walks parentElement chain for tag containing '-'
  #strengthFor(offScreenRatio, count)  // 'high' | 'medium' | 'low'
}
```

**emit payload**:
```js
{ virtualizationOpportunity: true, childTag: 'x-list-item', childCount: 342,
  offScreenRatio: 0.91, parentTag: 'x-product-grid', strength: 'high' }
```

Evidence: `EvidenceLevel.OBSERVATION` + `AttributionQuality.HEURISTIC` + confidence 0.7

**Key**: Wrap all DOM access in try/catch (SSR guard). `#emittedKeys` is cleared at the start of each scan (allows re-evaluation after DOM changes).

**Panel section** (border `#94e2d5` teal): "📦 Virtualization Candidates — N patterns"  
Shows child tag × count, off-screen %, parent. Copy: "Consider `@lit-labs/virtualizer` for `<childTag>` inside `<parentTag>`."

**Pinpoint**: `issueType: 'virtualization-opportunity'`, `severity: 'high' if strength==='high' else 'medium'`

**Tests**: Fake `windowTarget` with mock `document.querySelectorAll` and mock `getBoundingClientRect` return values.

---

## Mission 12D — DomDuplicationAdvisor

**Pain**: Developers create one `<my-tooltip>` per list item — 100 modal/tooltip/dialog instances in the DOM — instead of one shared instance at parent level. The current render-storm detector counts lifecycle calls, not DOM structure duplication.

**New file**: `src/core/dom-duplication-advisor.js`

```js
const SINGLETON_ROLES = Object.freeze(['dialog', 'tooltip', 'alertdialog', 'menu']);
const SINGLETON_PATTERNS = Object.freeze(['modal', 'dialog', 'overlay', 'tooltip', 'popup', 'drawer', 'flyout', 'sheet']);
```

**Class signature**:
```js
class DomDuplicationAdvisor {
  #store; #windowTarget; #active = false;
  #scanIntervalMs = 3000;
  #minInstances = 3;
  #intervalId = null;
  
  constructor({ store, windowTarget, scanIntervalMs, minInstances })
  start()   // immediate scan + interval, returns this
  stop()    // clears interval, returns this
  scan()    // public for testing
  
  #scanOnce()
  #isSingletonElement(el)               // ARIA role OR tag name pattern match
  #findLowestCommonAncestor(elements)   // walk parentElement chains, cap at 100 hops, respect shadow root
  #identicalContentSignal(elements)     // innerHTML lengths within 10%
}
```

**LCA note**: Shadow DOM boundaries — if `el.getRootNode()` is a `ShadowRoot`, walk to `shadowRoot.host`. Cap ancestor chain at 100 to prevent unbounded traversal. Guard `innerHTML` access in try/catch (cross-origin shadow DOMs).

**emit payload**:
```js
{ domDuplication: true, duplicateTag: 'my-tooltip', instanceCount: 47,
  commonAncestorTag: 'x-product-grid', identicalContent: true, strength: 'high' }
```

Evidence: `EvidenceLevel.OBSERVATION` + `AttributionQuality.HEURISTIC` + confidence 0.7 (identicalContent) or 0.5 (structural only)

**Panel section** (border `#f38ba8` red — correctness issue): "🔁 DOM Duplication — N patterns"  
Shows tag × count × ancestor. Copy: "Move `<duplicateTag>` to `<commonAncestorTag>` and toggle visibility/content via a property. Don't mount N instances for N data items."

**Pinpoint**: `issueType: 'dom-duplication'`, `severity: 'high' if identicalContent else 'medium'`

---

## Mission 12E — PaintAdvisor

**Pain**: Current tool shows LCP/CLS/INP but nothing about layout thrash (forced reflow), expensive CSS on many elements, or first-paint timing. Developers don't know *why* paint is slow.

**New file**: `src/core/paint-advisor.js`  
Three sub-detectors, each independently useful:

**Class signature**:
```js
static #EXPENSIVE_CSS_PROPS = ['filter', 'backdrop-filter', 'box-shadow', 'border-radius', 'transform'];

class PaintAdvisor {
  #store; #windowTarget; #active = false;
  #layoutShiftObserver = null;
  #paintObserver = null;
  #cssExpensiveThreshold = 10;
  #cssIntervalId = null;
  #cssScanned = false;
  #recentLayoutShifts = [];  // rolling buffer cap 20
  #paintTimingEmitted = new Set();  // emit each metric once only
  #unsubscribe = null;
  
  constructor({ store, windowTarget, cssExpensiveThreshold })
  start()         // inits all 3 sub-detectors, returns this
  stop()          // disconnects observers, clears intervals, returns this
  scanExpensiveCss()  // public for testing
  
  // (a) Layout thrash via PerformanceObserver('layout-shift') + UPDATE_COMPLETED correlation
  #initLayoutShiftObserver()
  #onLayoutShiftEntry(entry)
  #correlateShiftWithUpdate(updateEvent)   // called from store subscription
  
  // (b) Expensive CSS
  #scanExpensiveCssOnce()   // batches with requestIdleCallback if available
  #checkComputedStyle(el, byProp)
  
  // (c) Paint timing
  #initPaintObserver()   // PerformanceObserver('paint') with buffered:true
  #onPaintEntry(entry)
}
```

**Three emit payload shapes**:
```js
// (a) layout thrash
{ layoutThrash: true, shiftValue: 0.12, updateOwnerTag: 'x-data-table', durationMs: 87 }
// (b) expensive CSS
{ expensivePaint: true, property: 'filter', elementCount: 23, exampleTag: 'x-card' }
// (c) paint timing
{ paintTiming: true, metric: 'first-contentful-paint', valueMs: 1240 }
```

Evidence: `OBSERVATION`+`HEURISTIC` for (a)+(b); `OBSERVATION`+`DETERMINISTIC` for (c)

**getComputedStyle performance note**: Cap scan at 500 elements per cycle. Use `requestIdleCallback` if available to avoid triggering the very problem being diagnosed.

**DO NOT** monkey-patch `Element.prototype.getBoundingClientRect` — use the `PerformanceObserver('layout-shift')` + UPDATE_COMPLETED correlation approach instead.

**Panel section** (border `#fab387` orange): "🎨 Paint Analysis"  
Three sub-sections as nested `<details>`:
- Layout Thrash: owner tag + shift value — "Investigate whether `<ownerTag>` reads layout metrics synchronously in its update cycle."
- Expensive CSS: property + count — "Reduce filter/backdrop-filter to <10 elements; apply `will-change:transform` only on actively-animating elements."
- Paint Timing: FP/FCP values, color-coded green (<1800ms) / yellow (<3000ms) / red (≥3000ms). Complements existing LCP display.

**Pinpoint**:
- `layoutThrash` → `issueType: 'layout-thrash'`, `severity: 'medium'`
- `expensivePaint` → `issueType: 'expensive-paint'`, `severity: elementCount > 30 ? 'high' : 'medium'`
- FCP > 3000ms → `issueType: 'paint-timing'`, `severity: 'high'`

> **Implement last** — three sub-detectors; implement in order: paint timing → expensive CSS → layout thrash.

---

## Files to Modify

| File | Change |
|---|---|
| `src/integration/lit/LitIntelligencePipeline.js` | Import + wire 5 new advisors (constructor, start, stop, `#onEvidence`) |
| `src/integration/lit/panel-intelligence-presentation.js` | Add 5 `_renderXxxSection(target)` functions, call in `_renderIntelligenceTab()` |
| `src/panel/LdsDebugPanel.js` | Add new Pinpoint issue blocks in `_buildPinpointIssues()` |
| `src/index.js` | Export all 5 new advisor classes |

## New Files to Create (per mission)

Each mission creates:
- `src/core/xxx-advisor.js` — the advisor
- `docs/features/NN-xxx-advisor.md` — feature doc (use template from CLAUDE.md)
- `docs/MISSION-12X-NAME.md` — mission doc (use template from CLAUDE.md)
- `test/unit/xxx-advisor.test.mjs` — ≥5 tests

## LitIntelligencePipeline.js wiring additions

Add after existing `#budgetMonitor` block:
```js
import { IdleSchedulingAdvisor }   from '../../core/idle-scheduling-advisor.js';
import { WorkerOpportunityAdvisor } from '../../core/worker-opportunity-advisor.js';
import { VirtualizationAdvisor }   from '../../core/virtualization-advisor.js';
import { DomDuplicationAdvisor }   from '../../core/dom-duplication-advisor.js';
import { PaintAdvisor }            from '../../core/paint-advisor.js';

// private fields:
#idleAdvisor = null;
#workerAdvisor = null;
#virtualizationAdvisor = null;
#domDuplicationAdvisor = null;
#paintAdvisor = null;
```

`#onEvidence()` DIAGNOSTIC dispatch extension:
```js
if (p?.idleOpportunity || p?.workerOpportunity || p?.virtualizationOpportunity ||
    p?.domDuplication || p?.layoutThrash || p?.expensivePaint || p?.paintTiming) {
    this.#dispatchPanelUpdate();
    return;
}
```

## Panel section render order in `_renderIntelligenceTab()`
```
${_renderCascadeSection(target)}
${_renderOrphanSection(target)}
${_renderNetworkCorrelationSection(target)}
${_renderBudgetViolationSection(target)}
${_renderIdleSchedulingSection(target)}       ← 12A
${_renderWorkerOpportunitySection(target)}    ← 12B
${_renderVirtualizationSection(target)}       ← 12C
${_renderDomDuplicationSection(target)}       ← 12D
${_renderPaintAdvisorSection(target)}         ← 12E
${_renderBackgroundHistorySection(target)}
```

## Implementation order
1. **12A IdleSchedulingAdvisor** — no browser APIs, purely store-driven, easiest to test
2. **12B WorkerOpportunityAdvisor** — one PerformanceObserver, network log correlation
3. **12C VirtualizationAdvisor** — interval DOM scan, establishes the scan-emit-dedup pattern
4. **12D DomDuplicationAdvisor** — builds on 12C pattern, adds LCA algorithm
5. **12E PaintAdvisor** — most complex: 3 sub-detectors, implement timing → CSS → layout-thrash

## Verification

After each mission:
1. `node --test test/unit/*.test.mjs` — all 100+ existing tests must still pass, new tests must pass
2. Panel section renders without error when feature disabled (empty snapshot → returns `''`)
3. All 4 artifacts present (feature doc, mission doc, implementation, test suite)

Browser validation (after all 5 missions):
- Open a Lit app with a long list → VirtualizationAdvisor fires within 5s
- Open a page with multiple tooltip instances per item → DomDuplicationAdvisor fires
- Trigger a background refresh → IdleSchedulingAdvisor shows it as non-urgent
- Inspect a page with heavy filter CSS → PaintAdvisor expensivePaint fires
- Trigger a large network response → WorkerOpportunityAdvisor correlates the long task
