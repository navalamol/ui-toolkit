# Runtime Intelligence — Architecture

> Version: 2026-10-10 | Missions 01–10E complete
> Read CLAUDE.md for operating constraints and the 4-artifact rule.

---

## What this builds

A **live, in-browser developer tool** that tells you *why* your UI is broken or slow. Unlike Lighthouse
(synthetic, cold-boot, no framework semantics), this tool runs on the developer's machine with full
framework access — giving it the causal chain Lighthouse can never provide.

**The product promise:**
> After reproducing a bug, a developer opens the Intelligence tab and reads: problem → likely cause → source location → what to do next. No log scanning, no `console.log` archaeology.

---

## Full Pipeline (with Mission 10A–10E additions)

```
Browser runtime
      │
      │  Framework lifecycle events
      │
      ├─── NavigationBridge (Mission 10C)
      │    src/integration/lit/navigation-bridge.js
      │    Patches history.pushState / replaceState / listens popstate
      │    Emits: NAVIGATION events
      │    Orphan check (5s after nav): OWNER_CREATED without OWNER_DESTROYED
      │    → DIAGNOSTIC { orphanSuspect:true, ownerId, tag, survivedNavigationCount }
      │
      ├─── NetworkStateCorrelator (Mission 10D)
      │    src/integration/lit/network-state-correlator.js
      │    Subscribes to store; correlates NETWORK_COMPLETED → STATE_CHANGED within windowMs
      │    → DIAGNOSTIC { networkCorrelation:true, traceId, networkEventId, stateOwnerId, tracedMs }
      │    EvidenceGraph auto-creates TRACE_CONTEXT edges when ≥2 DIAGNOSTICs share same traceId
      │
      ▼
LitAdapter                      src/adapter/lit/LitAdapter.js
      │
      │  connect(el)            → OWNER_CREATED
      │  disconnect(el)         → OWNER_DESTROYED (+ pops from _renderStacks)
      │  recordUpdateRequested  → STATE_CHANGED (runs interceptor chain first)
      │                           → DEPENDENCY_TRIGGERED if _renderStacks non-empty and parent.el≠el
      │                           → UPDATE_REQUESTED
      │  recordUpdateStarted    → UPDATE_STARTED (pushes to _renderStacks)
      │  recordUpdateCompleted  → UPDATE_COMPLETED (pops from _renderStacks)
      │
      │  Cascade tracking (Mission 10A):
      │    _renderStacks: WeakMap<LitAdapter, [{el, ownerId, startEventId}]>
      │    When B's requestUpdate fires while A is on the stack:
      │    emit DEPENDENCY_TRIGGERED { causedByEventId: A's UPDATE_STARTED.id }
      │
      │  State intercept (Mission 10B):
      │    addStateChangeInterceptor(fn) → unsubscribe fn
      │    Interceptors run before STATE_CHANGED; PropertyWatchManager uses this
      │    to capture call stacks and detect threshold violations
      │
      ▼
Evidence Store                  src/core/evidence-store.js
      │  bounded (maxEntries=1000), immutable (deep-frozen), privacy-filtered
      │  emit(input, context={}) → frozen UREP event
      │  subscribe(fn)          → unsubscribe fn
      │  snapshot({type?, ownerId?, traceId?}) → filtered event array
      │  clear()
      │  resolveReference(id)   → { status: 'present'|'evicted'|'unknown', sequence? }
      │
      │  Privacy: applyPrivacyPolicyToEvidenceInput() runs before createEvidenceEvent()
      │  maskUrlQuery() strips query params from all URLs at capture
      │
      ├─── UpdateBudgetMonitor (Mission 10E)
      │    src/core/update-budget-monitor.js   ← framework-neutral, src/core/
      │    Subscribes to store (UPDATE_COMPLETED)
      │    Rolling window per owner: if count > countPerWindow within windowMs
      │    → DIAGNOSTIC { budgetViolation:true, ownerId, tag, updateCount, windowMs, countPerWindow }
      │    Configurable: setBudget(tagName, {countPerWindow, windowMs})
      │    Default: { countPerWindow:5, windowMs:100 }
      │
      ▼
Incident Flight Recorder        src/core/incident-flight-recorder.js
      │  States: IDLE → RECORDING → FROZEN
      │  Trigger conditions: UPDATE_COMPLETED.durationMs ≥ slowUpdateThresholdMs (500ms default)
      │                       or ERROR event
      │  Rolling buffer: holds last N events before trigger
      │  On freeze: snapshot captured for analysis
      │
      ▼
Evidence Graph                  src/core/evidence-graph.js
      │  Builds immutable DAG from frozen incident events
      │
      │  Edge types:
      │    CAUSES             ← correlation.causedByEventId (confidence inherits from event)
      │    PARENT             ← correlation.parentEventId   (confidence inherits from event)
      │    TRACE_CONTEXT      ← shared correlation.traceId  (confidence 0.6, needs ≥2 events)
      │    INTERACTION_CONTEXT← shared correlation.interactionId (confidence 0.7)
      │
      ├─── CascadeAnalyzer (Mission 10A)
      │    src/core/cascade-analyzer.js   ← framework-neutral, src/core/
      │    analyze(graph) → CascadeReport | null
      │    Finds DEPENDENCY_TRIGGERED fan-out from a single root STATE_CHANGED
      │    Reports: rootEventId, componentCount, depth, totalUpdateMs, branches, overReactingOwners
      │
      ▼
Root Cause Grouper              src/core/root-cause.js
      │  Heuristic scoring — NOT ML
      │  Clusters events by causal chain; scores by edge weight + event type
      │  Returns: { rootLabel, strength, cluster[], actionable }
      │
      ▼
LitIntelligencePipeline         src/integration/lit/LitIntelligencePipeline.js
      │  Orchestrator. Holds references to:
      │    #recorder (IncidentFlightRecorder)
      │    #grouper  (RootCauseGrouper)
      │    #cascadeAnalyzer (CascadeAnalyzer)          ← Mission 10A
      │    #watchManager   (PropertyWatchManager)      ← Mission 10B
      │    #navBridge      (NavigationBridge)          ← Mission 10C
      │    #networkCorrelator (NetworkStateCorrelator) ← Mission 10D
      │    #budgetMonitor  (UpdateBudgetMonitor)       ← Mission 10E
      │
      │  start() → starts all sub-components, installs window globals:
      │    window.__LDS_INTELLIGENCE_PIPELINE__ = this
      │    window.__LDS_WATCH_PROPERTY__(tag, prop, opts)
      │    window.__LDS_UNWATCH_PROPERTY__(tag, prop)
      │  stop()  → stops all, clears window globals
      │  resume() → clears incident, restarts recording
      │
      │  On incident: #analyze() → runs cascadeAnalyzer, grouper
      │  On publish:  window.__LDS_CASCADE_REPORT__ = latestCascade
      │               window.__LDS_EVIDENCE_STORE__  = store (for panel reads)
      │
      ▼
panel-intelligence-presentation.js
      src/integration/lit/panel-intelligence-presentation.js
      Renders the Intelligence tab inside LdsDebugPanel.
      Sections (in render order):
        1. Current finding       — RootCauseGrouper output: rootLabel + actionable steps
        2. Cascade               — CascadeAnalyzer: "1 change → N components → Xms total"
        3. Property mutations    — PropertyWatchManager DIAGNOSTICs (watchAlert:true)
        4. Navigation orphans    — NavigationBridge DIAGNOSTICs (orphanSuspect:true)
        5. Network trigger       — NetworkStateCorrelator DIAGNOSTICs (networkCorrelation:true)
        6. Over-rendering        — UpdateBudgetMonitor DIAGNOSTICs (budgetViolation:true)
        7. Technical evidence    — Raw EvidenceGraph nodes + edges
```

---

## Framework Isolation Rule

```
src/core/         ← ZERO framework imports
src/adapter/      ← ONE framework (Lit or React or Vue)
src/integration/  ← wiring between adapter + core (one subfolder per framework)
```

Adding Vue:
1. `src/adapter/vue/VueAdapter.js` — extend `FrameworkAdapter`, emit UREP from Vue lifecycle hooks (watchEffect, onMounted, onUnmounted)
2. `src/integration/vue/VueIntelligencePipeline.js` — clone of LitIntelligencePipeline wired to VueAdapter
3. `NavigationBridge`, `NetworkStateCorrelator`, `CascadeAnalyzer`, `UpdateBudgetMonitor` — **zero changes** (they only read from the store)
4. `PropertyWatchManager` — Vue-specific version that wraps `reactive()` / `ref()` Proxy setters

---

## Evidence System

### UREP Event shape
```js
{
  schemaVersion: '1.1',
  id:        string,          // 'evt-N' — assigned by store
  sequence:  number,          // monotonic counter
  timestamp: number,          // ms since epoch (injected by store clock)
  type:      RuntimeEventType,
  framework: { name, version, adapterVersion },
  owner:     { id, instanceId, lifecycleGeneration, kind, name, parentId } | null,
  source:    { file, line, column, functionName } | null,
  correlation: {
    causedByEventId?: string,  // → CAUSES edge in EvidenceGraph
    parentEventId?:  string,   // → PARENT edge
    traceId?:        string,   // → TRACE_CONTEXT edges (needs ≥2 events)
    interactionId?:  string,   // → INTERACTION_CONTEXT edges
  },
  evidence: {
    level:       EvidenceLevel,
    attribution: AttributionQuality,
    confidence:  number | null,  // 0–1
  },
  payload: object,  // deep-frozen, event-specific
}
```

### Evidence Ladder (never violate)
```
OBSERVATION          "I saw this happen"          ← deterministic framework events
CORRELATION          "These happened near each other" ← temporal proximity
ATTRIBUTION          "This probably caused that"  ← framework-reported causality
LIFETIME_VIOLATION   "This resource outlived its owner"
RETAINER_CONFIRMED   "This reference is preventing GC"
CAUSALITY_CONFIRMED  "I have proof this caused that"
```

Rules classify evidence — they do not manufacture stronger evidence.

### EvidenceGraph edge types
| Edge | Trigger | Confidence | Correct use |
|------|---------|-----------|-------------|
| CAUSES | `correlation.causedByEventId` | inherits from source event | Direct causal link (adapter-reported) |
| PARENT | `correlation.parentEventId` | inherits from source event | Structural hierarchy (e.g. parent component) |
| TRACE_CONTEXT | shared `correlation.traceId` (≥2 events) | 0.6 | Temporal grouping (network→state, not causation) |
| INTERACTION_CONTEXT | shared `correlation.interactionId` (≥2 events) | 0.7 | Same user interaction session |

---

## Cascade Detection — Mission 10A

**Problem:** "I clicked one button and 20 components re-rendered. Which ones and why?"

**Mechanism** (`_renderStacks` WeakMap in `LitAdapter`):
1. `recordUpdateStarted(el)` → push `{ el, ownerId, startEventId }` onto adapter's render stack
2. `recordUpdateCompleted(el)` → pop by `el` reference
3. `recordUpdateRequested(el, name, oldValue)` → if stack non-empty AND `parent.el !== el`:
   - The currently-rendering parent A is causing child B's update
   - Emit `DEPENDENCY_TRIGGERED` with `correlation.causedByEventId = A.startEventId`
4. `CascadeAnalyzer.analyze(graph)` finds all `DEPENDENCY_TRIGGERED` events, walks to root, computes fan-out

**Why WeakMap per adapter instance (not module-level array):** Multi-adapter test safety. Each `LitAdapter` instance has its own stack — no cross-contamination.

---

## Property Watching — Mission 10B

**Problem:** "Something is setting `this.loading = true` and never clearing it. I can't find where."

**Mechanism** (`addStateChangeInterceptor` in `LitAdapter`):
1. `LitAdapter.addStateChangeInterceptor(fn)` → fn is called with `(el, name, oldValue)` before `STATE_CHANGED` is emitted
2. `PropertyWatchManager.watch(tag, prop, {threshold, windowMs})` installs an interceptor on all connected elements matching `tag`
3. On match: capture `new Error().stack`, parse via `parseRuntimeSourceLocation()`, emit `STATE_CHANGED { watchSource:true, source }`
4. If mutation count exceeds `threshold` in `windowMs`: emit `DIAGNOSTIC { watchAlert:true, tag, prop, mutationCount }`

**Window API:** `window.__LDS_WATCH_PROPERTY__('x-product-card', 'price')` — installed by `LitIntelligencePipeline.start()`

---

## Navigation & Orphan Detection — Mission 10C

**Problem:** "App gets slower after 10 minutes of navigation. Heap snapshot grows but I can't tell which components are leaking."

**Mechanism** (`NavigationBridge`):
1. Patches `history.pushState` and `history.replaceState`; listens to `popstate`
2. On navigation: emit `NAVIGATION { url: maskUrlQuery(href), type, timestamp }`
3. After 5s delay: compare `store.snapshot({type:OWNER_CREATED})` vs `store.snapshot({type:OWNER_DESTROYED})`
4. Owners born before nav with no DESTROYED entry → `DIAGNOSTIC { orphanSuspect:true, ownerId, tag, survivedNavigationCount }`
5. `orphanCheckDelayMs:0` for synchronous test execution

**Evidence level:** `CORRELATION` — destruction might legitimately be deferred (transitions, lazy cleanup).

---

## Network→State Correlation — Mission 10D

**Problem:** "After this API call, 6 components re-rendered slowly. I don't know which state changes it triggered."

**Mechanism** (`NetworkStateCorrelator`):
1. Subscribes to store; on `NETWORK_COMPLETED`: create pending entry `{ traceId: 'net-trace-'+eventId, expiresAt: now + windowMs }`
2. Bounded to 20 pending entries (oldest dropped on overflow)
3. On `STATE_CHANGED` within window: emit `DIAGNOSTIC { networkCorrelation:true, traceId, networkEventId, stateOwnerId }` with `correlation.causedByEventId = networkEventId, traceId`
4. Two STATE_CHANGEDs from same network call → two DIAGNOSTICs sharing `traceId` → EvidenceGraph creates `TRACE_CONTEXT` edges between them

**Default window:** 500ms (configurable via `correlationWindowMs` constructor option)

---

## Update Budget Monitoring — Mission 10E

**Problem:** "I set one property and 20 components re-rendered. Something is over-reacting to state changes it doesn't need."

**Mechanism** (`UpdateBudgetMonitor`, rolling window):
1. Subscribes to store (UPDATE_COMPLETED events)
2. Per owner: push `{timestamp: now}`, prune entries older than `now - windowMs`
3. If `pruned.length > countPerWindow`: emit `DIAGNOSTIC { budgetViolation:true, ownerId, tag, updateCount, windowMs, countPerWindow, totalMs }`
4. Per-tag budget overrides via `setBudget(tagName, {countPerWindow, windowMs})`

**Default budget:** `{ countPerWindow: 5, windowMs: 100 }` — fires when a component updates more than 5 times in 100ms.

---

## Panel Surface

Intelligence tab layout (all in `panel-intelligence-presentation.js`):

```
┌─ Intelligence Tab ──────────────────────────────────┐
│  Current finding                                    │  ← RootCauseGrouper: rootLabel + actionable steps
│                                                     │
│  ▶ Reactive cascade      [collapses]                │  ← CascadeAnalyzer: "N components, depth M, Xms"
│  ▶ Property mutations    [collapses]                │  ← PropertyWatchManager DIAGNOSTICs
│  ▶ Navigation orphans    [collapses]                │  ← NavigationBridge DIAGNOSTICs
│  ▶ Network trigger       [collapses]                │  ← NetworkStateCorrelator DIAGNOSTICs
│  ▶ Over-rendering        [collapses]                │  ← UpdateBudgetMonitor DIAGNOSTICs
│                                                     │
│  Technical evidence      [full graph]               │  ← raw EvidenceGraph nodes + edges
└─────────────────────────────────────────────────────┘
```

Each diagnostic section reads from `window.__LDS_EVIDENCE_STORE__.snapshot({type:'diagnostic'})` and filters by its own payload flag.

---

## Adding a New Framework Adapter

```
1. src/adapter/<framework>/<Framework>Adapter.js
   ├─ extend FrameworkAdapter
   ├─ declare capabilities in constructor
   └─ emit UREP events from framework lifecycle hooks:
      connect()       → OWNER_CREATED
      disconnect()    → OWNER_DESTROYED
      onStateChange() → STATE_CHANGED + UPDATE_REQUESTED
      onRenderStart() → UPDATE_STARTED
      onRenderEnd()   → UPDATE_COMPLETED
      onError()       → ERROR

2. src/integration/<framework>/<Framework>IntelligencePipeline.js
   └─ clone LitIntelligencePipeline, swap LitAdapter import

3. Zero changes to src/core/
   CascadeAnalyzer, UpdateBudgetMonitor, EvidenceGraph, RootCauseGrouper — all reused unchanged.
   NavigationBridge — browser-level API, works for any SPA router.
   NetworkStateCorrelator — store subscription, framework-neutral.
```

---

## Known Gaps

- `panel-intelligence-presentation.js` couples to `_completeReplay()` private method — replace with `lds-replay-complete` event hook in a future panel-integration milestone
- `DiagnosticPolicy` archived (`src/archive/`) — reconnect if dynamic per-route rule budgets become a real product requirement
- `network.js`, `perf.js`, `memory.js` still write to `__LDS_*` globals only — full UREP migration needed before v1 release claim
- `ResourceOwnershipLedger` in `src/future/` is fully tested (10 tests) — wire when `memory.js` emits `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED`
- Evidence capsule `aiPrompt` field is auto-generated — improve with structured problem framing once finding quality is validated in production
- `window.__LDS_SET_UPDATE_BUDGET__` global — deferred; `budgetMonitor().setBudget()` via pipeline accessor achieves the same
