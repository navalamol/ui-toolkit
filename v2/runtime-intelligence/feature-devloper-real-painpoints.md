# Runtime Intelligence — Developer Pain Point Missions (10A–10E)

## Context

The goal is to make this tool indispensable for UI developers — solving the hard, daily problems
that Lighthouse cannot (synthetic, cold-boot, no framework semantics) and that DevTools only partially
address (no causal chain, no cross-component awareness). The tool runs live on the developer's machine
with full framework access. Every new feature must:

1. **Emit standard UREP events** — framework-specific code lives only in the adapter/bridge layer;
   the intelligence kernel (`EvidenceGraph`, `RootCauseGrouper`, `IncidentFlightRecorder`) processes
   them identically across Lit, React, and Vue.
2. **Never manufacture stronger evidence** — rules classify, they don't upgrade.
3. **Privacy at every capture and export boundary** — same policy as existing bridges.
4. **Be additive** — never remove or hide existing panel surfaces or evidence.

P0 browser validation (npm link into UI Platform, trigger error + slow render) should run before
or alongside these missions — it's a gate for Mission 10 Vue, not for 10A–10E.

---

## Existing infrastructure to reuse (do not duplicate)

| What | Where | Notes |
|---|---|---|
| `DEPENDENCY_TRIGGERED`, `NAVIGATION`, `INTERACTION`, `BROWSER_FRAME` event types | `src/core/evidence-protocol.js` | Already in protocol — never emitted. Wire them. |
| `DIAGNOSTIC` event type | `src/core/evidence-protocol.js` | Use for budget violations and orphan findings |
| `ResourceOwnershipLedger` | `src/future/resource-ownership-ledger.js` | Fully written, 19 tests. Just needs RESOURCE_ACQUIRED/RELEASED events to flow. |
| `LitAdapter.hookRequestUpdate(el, fn)` | `src/adapter/lit/LitAdapter.js:hookRequestUpdate` | v1 compat shim; intercepts `requestUpdate(name, oldValue)` per-element |
| `LitAdapter.hookAfterRender(el, fn)` | `src/adapter/lit/LitAdapter.js:hookAfterRender` | Fires after `updated(changedProps)` per-element |
| `parseRuntimeSourceLocation(line)` | `src/core/source-resolver.js` | Parse JS stack frame string → `{ file, line, column, functionName }` |
| `LdsNetwork.subscribe(fn)` | `src/core/network.js` | Subscribe to network entries without re-patching fetch/XHR |
| `EvidenceGraph` TRACE_CONTEXT edges | `src/core/evidence-graph.js` | Any events sharing `correlation.traceId` → `TRACE_CONTEXT` correlation edge automatically |
| `EvidenceGraph` INTERACTION_CONTEXT edges | `src/core/evidence-graph.js` | Any events sharing `correlation.interactionId` → `INTERACTION_CONTEXT` correlation edge |
| `cycle-detector.js` render stack | `src/core/cycle-detector.js` | Already tracks "currently rendering" per-element with patch state on `el.__ldsCyclePatch` |
| `prop-audit.js` thrash detection | `src/core/prop-audit.js` | Already detects >N mutations/1000ms, writes to `window.__LDS_THRASH__`; complement (don't replace) with UREP emission |
| `_toolEnabled(key)` | `src/core/gate.js` | Use for all new opt-in gates |
| `EvidenceLevel`, `AttributionQuality` | `src/core/evidence-protocol.js` | All new events must pick correct level |

---

## Mission 10A — Reactive Cascade Tracker

**The pain:** "I clicked one button and 20 components re-rendered. I have no idea which ones or why."
Lighthouse: sees total paint time. This tool: shows the full fan-out graph with causal edges.

### What to build

**`src/adapter/lit/LitAdapter.js` — cascade tracking**

Add a module-level render stack:
```js
const _renderStack = []; // stack of owner ids currently mid-performUpdate
```

In `recordUpdateStarted(el)`: push `owner.id` onto `_renderStack`.
In `recordUpdateCompleted(el)`: pop `owner.id` from `_renderStack`.

Extend `recordUpdateRequested(el, name, oldValue)`: if `_renderStack.length > 0` when this fires,
the parent component (top of stack) is causing this update. Emit `DEPENDENCY_TRIGGERED` **in addition
to** the existing `STATE_CHANGED` + `UPDATE_REQUESTED` events:

```js
adapter.emit(RuntimeEventType.DEPENDENCY_TRIGGERED, {
  owner,                         // the component being triggered (B)
  correlation: {
    causedByEventId: <the UPDATE_STARTED event id of the currently-rendering parent A>,
  },
  evidence: {
    level: EvidenceLevel.ATTRIBUTION,
    attribution: AttributionQuality.FRAMEWORK_REPORTED,
    confidence: 0.85,
  },
  payload: {
    triggerProperty: name ?? null,        // which prop on B was set
    triggerSource: 'reactive-cascade',
  },
});
```

**`src/core/cascade-analyzer.js` — new, framework-neutral**

```js
class CascadeAnalyzer {
  analyze(graph) → CascadeReport
}
```

A `CascadeReport` contains:
- `rootEventId` — the originating STATE_CHANGED or INTERACTION event
- `componentCount` — distinct owners in the cascade
- `depth` — longest chain depth
- `branches` — array of { ownerId, tag, triggerCount, depth }
- `totalUpdateMs` — sum of UPDATE_COMPLETED durationMs for all cascaded components
- `overReactingOwners` — owners triggered >3 times by the same root (potential optimization targets)

Algorithm: from any `DEPENDENCY_TRIGGERED` event, walk `causedByEventId` backwards through the graph
to find the root `STATE_CHANGED` or `INTERACTION` event. Then walk forward via `CAUSES` edges to
enumerate all downstream components.

**`src/integration/lit/LitIntelligencePipeline.js`** — instantiate `CascadeAnalyzer`, run it in
`#analyze()` when incident type is `'lit-slow-update'` or when `DEPENDENCY_TRIGGERED` count > 3.
Add `cascade` field to the analysis context and capsule.

**Panel** — add a "Cascade" section to the Intelligence tab in
`panel-intelligence-presentation.js`: "1 state change → 4 components → 12 renders (total 847ms)"
with a collapsible list of component tags and their individual render times.

### Framework-neutral design note
ReactAdapter emits `DEPENDENCY_TRIGGERED` when Profiler `onRender` fires for a child commit
that traces back to a parent's state update. VueAdapter does the same via watchEffect dependency
tracking. `CascadeAnalyzer` never imports from `LitAdapter` — it only reads UREP events.

### New test file
`test/unit/cascade-analyzer.test.mjs`
1. Single component update → no cascade report (no DEPENDENCY_TRIGGERED events)
2. A updates → triggers B and C → `componentCount === 3`, `depth === 2`
3. A → B → C (chain) → `depth === 3`
4. Over-reacting component detected when triggered >3 times by same root
5. `totalUpdateMs` sums only cascaded UPDATE_COMPLETED durations

---

## Mission 10B — Property Watch with Call Stack

**The pain:** "Something is setting `this.loading = true` and never clearing it. I can't find where
in a 200-file codebase." Developers add `console.log` everywhere. This eliminates that workflow.

### What to build

**`src/integration/lit/property-watch-manager.js` — new**

```js
class PropertyWatchManager {
  constructor({ adapter, store }) {}

  watch(tagName, propName, { threshold = 3, windowMs = 1000 } = {})
  // Returns an unwatch() function.
  // Hooks adapter.hookRequestUpdate on every connected element matching tagName.
  // On each requestUpdate(name, oldValue) where name === propName:
  //   1. Capture `new Error().stack`
  //   2. Parse first non-watch-manager frame via parseRuntimeSourceLocation()
  //   3. Emit STATE_CHANGED with source (call-stack origin) and evidence ATTRIBUTION + SOURCE_ATTRIBUTED
  //   4. Track mutation count in a rolling windowMs window per owner
  //   5. If count > threshold in window: emit DIAGNOSTIC with payload.watchAlert = true

  unwatch(tagName, propName)
  // Removes hooks for that property watch.

  watchAll(tagName, { threshold, windowMs } = {})
  // Watches all declared reactive properties on matching elements.
}
```

**Window API** (installed by `LitIntelligencePipeline.start()` when intelligence is enabled):
```js
window.__LDS_WATCH_PROPERTY__ = (tagName, propName, options) => manager.watch(tagName, propName, options);
window.__LDS_UNWATCH_PROPERTY__ = (tagName, propName) => manager.unwatch(tagName, propName);
```

**Key constraints:**
- Call stack capture uses `new Error().stack` — parse via existing `parseRuntimeSourceLocation()`
  (already in `src/core/source-resolver.js`), skip frames that are watch-manager-internal
- `STATE_CHANGED` events emitted by watches have `payload.watchSource: true` to distinguish from
  normal LitAdapter STATE_CHANGED events (semantic distinction, same as `payload.source: 'perf-legacy'`)
- Do NOT patch prototype — patch per-element instance via `hookRequestUpdate` (LitAdapter already
  does this safely with stacking protection from legacy-wrapper-lifecycle hardening)
- Watches survive element reconnect: hook on `OWNER_CREATED` events for the target tag

**`src/integration/lit/LitIntelligencePipeline.js`** — create `PropertyWatchManager` in
constructor; expose via `pipeline.watchManager()`.

### Framework-neutral design note
React: intercept the `useState` setter dispatch — same UREP `STATE_CHANGED` event with call stack.
Vue: intercept `reactive()` / `ref()` setters via Proxy trap. `PropertyWatchManager` is the
Lit-adapter-specific layer; the UREP emission pattern is identical across frameworks.

### New test file
`test/unit/property-watch-manager.test.mjs`
1. Watch fires STATE_CHANGED with `source.file` populated from call stack
2. Mutation below threshold → no DIAGNOSTIC event
3. Mutation above threshold within window → DIAGNOSTIC with `watchAlert: true`
4. `unwatch()` removes the hook — no further events
5. `payload.watchSource === true` on watch-emitted STATE_CHANGED (not on normal LitAdapter ones)

---

## Mission 10C — Navigation Events + Component Orphan Detector

**The pain:** "App gets slower after 10 minutes of navigation. Heap snapshot grows but I can't
tell which components are leaking." Session-length memory leaks are completely invisible to Lighthouse.

### What to build

**`src/integration/lit/navigation-bridge.js` — new**

Emits `RuntimeEventType.NAVIGATION` events on:
- `window.addEventListener('popstate', ...)` 
- Override of `history.pushState` and `history.replaceState`

```js
store.emit(RuntimeEventType.NAVIGATION, {
  owner: null,
  evidence: { level: EvidenceLevel.OBSERVATION, attribution: AttributionQuality.DETERMINISTIC, confidence: 1.0 },
  payload: {
    url: sanitizeNavigationUrl(location.href),   // mask query params via existing maskUrlQuery()
    type: 'pushState' | 'popstate' | 'replaceState',
    timestamp: Date.now(),
  },
});
```

**Orphan detection in `navigation-bridge.js`:**

After each navigation event, schedule a check (setTimeout 5000ms) that:
1. Calls `store.snapshot({ type: RuntimeEventType.OWNER_CREATED })` for owners created before the navigation
2. Cross-references against `store.snapshot({ type: RuntimeEventType.OWNER_DESTROYED })`
3. Owners in set 1 but not set 2 (survived the route change without being destroyed) →
   emit `DIAGNOSTIC` with `payload.orphanSuspect: true, ownerId, tag, survivedNavigationCount`
4. Evidence level: `CORRELATION` (temporal, not causal — destruction might legitimately be deferred)

**`src/future/resource-ownership-ledger.js` — reconnect (minimal wiring)**

The `ResourceOwnershipLedger` is fully written and tested. Wire it:
- In `src/core/memory.js` (`LdsMemory`): add calls to `adapter.emit(RuntimeEventType.RESOURCE_ACQUIRED, ...)`
  and `adapter.emit(RuntimeEventType.RESOURCE_RELEASED, ...)` alongside the existing
  `window.__LDS_MEMORY_LOG__` writes
- In `src/index.js`: uncomment the `ResourceOwnershipLedger` export (remove the DEFERRED comment)
- In `LitIntelligencePipeline`: optionally instantiate `ResourceOwnershipLedger` (behind
  `_toolEnabled('resourceTracker')` — already has a gate flag)

### Framework-neutral design note
`NAVIGATION` events are browser-level (popstate/history API) — the same `navigation-bridge.js`
works identically for React Router, Vue Router, or any SPA. The NavigationBridge does not import
from LitAdapter at all.

### New test file
`test/unit/navigation-bridge.test.mjs`
1. `pushState` → emits NAVIGATION with sanitized URL (no query params in payload)
2. `popstate` → emits NAVIGATION
3. Orphan detection: OWNER_CREATED before navigation + no OWNER_DESTROYED → DIAGNOSTIC with `orphanSuspect: true`
4. Clean component (OWNER_CREATED + OWNER_DESTROYED before navigation) → no orphan DIAGNOSTIC
5. Orphan count increments across multiple navigations

---

## Mission 10D — Network → State Causal Correlator

**The pain:** "After this API call, 6 components re-rendered slowly. I don't know which state
changes it triggered." Lighthouse sees the paint spike; it cannot attribute it to a network call.

### What to build

**`src/integration/lit/network-state-correlator.js` — new**

Subscribes to the evidence store. When a `NETWORK_COMPLETED` event arrives:
1. Generate a `correlationTraceId` (e.g., `net-trace-${event.id}`)
2. Store `{ traceId: correlationTraceId, expiresAt: Date.now() + correlationWindowMs }` in a
   bounded Map (max 20 pending correlations — prevent memory leak)
3. For every subsequent `STATE_CHANGED` event within `correlationWindowMs`:
   - Add `correlation.traceId = correlationTraceId` to the event's correlation block
   - This is done by re-emitting a `DIAGNOSTIC` event that links them, since UREP events are
     immutable once created. The DIAGNOSTIC carries `{ networkEventId, stateEventId, tracedMs }`
     with `causedByEventId = networkEventId`.

**Alternative (preferred if store API allows):** Pass `traceId` as a session-level context to
`store.emit()` — check if `EvidenceStore.emit(input, context)` context param threads through.
If `context.traceId` is supported, set it on STATE_CHANGED events directly from the correlator
by wrapping the adapter's emit via a store middleware approach.

**Configurable:**
```js
window.__LDS_NETWORK_CORRELATION_WINDOW_MS__ = 500; // default
```

**EvidenceGraph picks this up automatically:** shared `traceId` → `TRACE_CONTEXT` edges with
`confidence: 0.6`. The existing `_incidentReasonFor()` and `RootCauseGrouper` will rank
`NETWORK_STARTED` events as root candidates (it's already in the scoring formula with weight 1).

**Panel** — In the Intelligence tab, when a slow-update incident is analyzed and the cascade
includes `TRACE_CONTEXT` edges back to a `NETWORK_COMPLETED` event, show:
"Likely triggered by: GET /api/products (completed 240ms before first state change)"

### New test file
`test/unit/network-state-correlator.test.mjs`
1. NETWORK_COMPLETED → STATE_CHANGED within window → shared traceId linkage
2. STATE_CHANGED after window expiry → no linkage
3. Multiple network calls → each STATE_CHANGED is correlated with the closest preceding network event
4. Privacy: network event's URL retains path only (no query — already enforced by network-evidence-bridge)
5. Bounded pending correlation map: >20 concurrent network events drops oldest

---

## Mission 10E — Update Budget Monitor

**The pain:** "I set one property and 20 components re-rendered. Something is over-reacting to
state changes it doesn't need." Complements cascade tracking with quantitative thresholds.

### What to build

**`src/core/update-budget-monitor.js` — new, framework-neutral**

```js
class UpdateBudgetMonitor {
  constructor({ store, budget = { countPerWindow: 5, windowMs: 100 }, onViolation }) {}
  // Subscribes to UPDATE_COMPLETED events.
  // Per owner: track update count in rolling windowMs.
  // When count > budget.countPerWindow: emit DIAGNOSTIC via store with:
  //   payload: { budgetViolation: true, ownerId, tag, updateCount, windowMs, totalMs }
  //   evidence: level CORRELATION (temporal observation, not causal)
  // Configurable per-tag budget override: setBudget(tagName, { countPerWindow, windowMs })

  start() → this
  stop() → this
  setBudget(tagName, options) → this
  clearBudgets() → this
}
```

**Window API:**
```js
window.__LDS_SET_UPDATE_BUDGET__ = (tagName, options) => monitor.setBudget(tagName, options);
```

**`LitIntelligencePipeline`** — instantiate `UpdateBudgetMonitor` in constructor, wire it.
Add budget violations to capsule's `causalChain` when the trigger event's owner has violations.

**Integration with Mission 10A:** `CascadeAnalyzer.overReactingOwners` and
`UpdateBudgetMonitor` violations for the same owner → upgrade to `ATTRIBUTION` level evidence.

### Framework-neutral design note
All frameworks emit `UPDATE_COMPLETED` (or equivalent render-complete event). The monitor
subscribes to the store, not to the adapter directly. Zero framework-specific code.

### New test file
`test/unit/update-budget-monitor.test.mjs`
1. Under-budget updates → no DIAGNOSTIC
2. Over-budget in window → DIAGNOSTIC with `budgetViolation: true`
3. Per-tag budget override respected
4. Rolling window correctly expires old updates
5. `stop()` unsubscribes — no further diagnostics

---

## Implementation order

| Mission | Effort estimate | Dependency | Reason for ordering |
|---|---|---|---|
| **10B** (Property Watch) | Medium | None | Highest daily-use value; independent |
| **10A** (Cascade Tracker) | Medium | None | DEPENDENCY_TRIGGERED already in protocol |
| **10C** (Navigation + Orphan) | Low–Medium | None | ResourceOwnershipLedger already written |
| **10D** (Network→State) | Medium | 10A helps | traceId threading, EvidenceGraph already handles it |
| **10E** (Update Budget) | Low | 10A optional | Simple rolling window, fully independent |

Each mission is independently releasable. 10A and 10B can be done in parallel.

---

## Panel surface strategy

All five features surface through the **existing Intelligence tab** — no new tabs needed yet.
The tab already has sections for "Current finding" and "Technical evidence". Add collapsible
sections:
- **Cascade** (10A): triggered components fan-out
- **Property mutations** (10B): watch hits with source locations
- **Lifetime** (10C): navigation survivor count
- **Network trigger** (10D): correlated network call
- **Over-rendering** (10E): budget violation summary

If the panel becomes too dense, a future "Diagnostics" tab can absorb these — but that is not
part of these missions.

---

## Verification for each mission

Each mission: run `node --test test/unit/*.test.mjs` — all 100 existing tests must pass,
plus the new tests added by the mission. After all five missions:
- Total test count: ~130+
- Browser validation (P0): trigger a cascade (click that causes >3 component re-renders) →
  Intelligence tab shows cascade section with component list and total ms
- Watch test: `window.__LDS_WATCH_PROPERTY__('x-product-card', 'price')` → set price 4 times →
  Intelligence tab shows DIAGNOSTIC with watchAlert
- Orphan test: navigate away and back — orphan suspects appear in Intelligence tab if any component
  was not cleaned up

---

## Framework extension path (after Lit validation)

When React adapter is added (Mission 11):
- `CascadeAnalyzer`, `UpdateBudgetMonitor`, `NavigationBridge`, `NetworkStateCorrelator` —
  **zero changes** (they only read UREP events from the store)
- `PropertyWatchManager` — new `ReactPropertyWatchManager` that wraps `useState`/`useReducer`
  dispatch instead of `hookRequestUpdate`. Same UREP emission pattern.
- ReactAdapter wires `DEPENDENCY_TRIGGERED` from Profiler `onRender` commit data.
- VueAdapter: same pattern, different hook point (Proxy setter for reactive refs).
