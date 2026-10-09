# Runtime Intelligence — Codebase Map

> Last updated: 2026-10-10 | Missions 01–10E complete | 139 unit tests (22 files)

---

## Entry Points

| How | File | Purpose |
|-----|------|---------|
| Import & wire | `src/index.js` | Barrel export of all public APIs |
| Lit integration | `src/integration/lit/LitIntelligencePipeline.js` | Create pipeline, call `.start()` |
| Lit mixin | `src/LitDebugMixin.js` | Drop-in mixin for any LitElement subclass |
| Browser console | `window.__LDS_INTELLIGENCE_PIPELINE__` | Access pipeline, watchManager, cascadeReport, etc. |
| Panel | `src/panel/LdsDebugPanel.js` | `<lds-debug-panel>` custom element |
| Singleton adapter | `litAdapter` (from `src/adapter/lit/LitAdapter.js`) | Default adapter instance shared across the app |
| Singleton store | `evidenceStore` (from `src/core/evidence-store.js`) | Default store instance |

---

## Architecture

```
Browser runtime
      │  Lit/React/Vue framework lifecycle events
      │
      ├── NavigationBridge ──────────────────────────┐  (history.pushState/replaceState/popstate)
      │   src/integration/lit/navigation-bridge.js   │
      │                                              │ emits NAVIGATION + DIAGNOSTIC(orphanSuspect)
      ├── NetworkStateCorrelator ────────────────────┤  (LdsNetwork events → STATE_CHANGED correlation)
      │   src/integration/lit/network-state-         │
      │   correlator.js                              │ emits DIAGNOSTIC(networkCorrelation)
      │                                              │
      ▼                                              │
Framework Adapter (src/adapter/lit/LitAdapter.js) ──┘
      │  emits UREP events:
      │  OWNER_CREATED / OWNER_DESTROYED
      │  STATE_CHANGED (+ interceptor chain for PropertyWatchManager)
      │  DEPENDENCY_TRIGGERED (cascade detection via _renderStacks WeakMap)
      │  UPDATE_REQUESTED / UPDATE_STARTED / UPDATE_COMPLETED
      │  ERROR, NETWORK_STARTED, NETWORK_COMPLETED
      │
      ▼
Evidence Store (src/core/evidence-store.js)
      │  bounded, immutable, privacy-filtered
      │  API: emit(input, context) | subscribe(fn)→unsubscribe | snapshot({type?,ownerId?,traceId?}) | clear()
      │
      ├──── UpdateBudgetMonitor ─────────────────────  rolling window per owner
      │     src/core/update-budget-monitor.js         emits DIAGNOSTIC(budgetViolation)
      │
      ▼
Incident Flight Recorder (src/core/incident-flight-recorder.js)
      │  rolling window + freeze on incident trigger
      │  States: IDLE → RECORDING → FROZEN
      │
      ▼
Evidence Graph (src/core/evidence-graph.js)
      │  immutable causal DAG
      │  Edge types: CAUSES | PARENT | TRACE_CONTEXT | INTERACTION_CONTEXT
      │
      ├──── CascadeAnalyzer ─────────────────────────  DEPENDENCY_TRIGGERED fan-out analysis
      │     src/core/cascade-analyzer.js
      │
      ▼
Root Cause Grouper (src/core/root-cause.js)
      │  heuristic scoring — NOT ML
      │  clusters with strength + rootLabel
      │
      ▼
LitIntelligencePipeline (src/integration/lit/LitIntelligencePipeline.js)
      │  orchestrator — holds recorder, grouper, cascadeAnalyzer, watchManager,
      │  navBridge, networkCorrelator, budgetMonitor
      │  publishes: window.__LDS_INTELLIGENCE_PIPELINE__ + __LDS_CASCADE_REPORT__
      │
      ▼
panel-intelligence-presentation.js
      Intelligence tab sections:
        • Current finding     (RootCauseGrouper)
        • Cascade             (CascadeAnalyzer → __LDS_CASCADE_REPORT__)
        • Property mutations  (PropertyWatchManager DIAGNOSTICs)
        • Navigation orphans  (NavigationBridge DIAGNOSTICs)
        • Network trigger     (NetworkStateCorrelator DIAGNOSTICs)
        • Over-rendering      (UpdateBudgetMonitor DIAGNOSTICs)
        • Technical evidence  (raw EvidenceGraph)
```

**Isolation rule:** `src/core/` has zero imports from `src/adapter/` or `src/integration/`. A new Vue adapter means new `src/adapter/vue/VueAdapter.js` + `src/integration/vue/` bridge. Core unchanged.

**EvidenceGraph edge types:**
| Edge | Trigger | Default confidence |
|------|---------|-------------------|
| CAUSES | `correlation.causedByEventId` | inherits from event |
| PARENT | `correlation.parentEventId` | inherits from event |
| TRACE_CONTEXT | shared `correlation.traceId` (≥2 events) | 0.6 |
| INTERACTION_CONTEXT | shared `correlation.interactionId` (≥2 events) | 0.7 |

---

## File Map

### `src/core/` — Framework-neutral kernel (zero framework imports)

| File | Key exports | Purpose |
|------|-------------|---------|
| `evidence-protocol.js` | `RuntimeEventType`, `EvidenceLevel`, `AttributionQuality`, `createEvidenceEvent`, `validateEvidenceEvent`, `summarizeRuntimeValue` | UREP v1.1 schema, enums, event factory |
| `evidence-store.js` | `EvidenceStore`, `evidenceStore` | Bounded, immutable, privacy-filtered event store. `emit(input, ctx)` (ln 39), `subscribe(fn)` (ln 67), `snapshot(filter?)` (ln 79), `clear()` (ln 92), `resolveReference(id)` (ln 96) |
| `evidence-graph.js` | `EdgeRelation`, `EvidenceGraph` | Builds immutable causal DAG from event array. `nodes()`, `edges()`, `outgoing(id)`, `incoming(id)`, `roots()` |
| `evidence-capsule.js` | `createEvidenceCapsule`, `buildEvidenceCapsuleAIPrompt`, `EVIDENCE_CAPSULE_SCHEMA_VERSION` | Serializable finding capsule for export/AI prompt |
| `incident-flight-recorder.js` | `IncidentFlightRecorder`, `RecorderState` | Rolling window that freezes on incident trigger. States: IDLE/RECORDING/FROZEN |
| `root-cause.js` | `RootCauseGrouper` | Heuristic scoring of causal clusters from EvidenceGraph. Returns `{ rootLabel, strength, cluster[] }` |
| `cascade-analyzer.js` | `CascadeAnalyzer` | Analyzes `DEPENDENCY_TRIGGERED` fan-out. `analyze(graph)→CascadeReport\|null` (Mission 10A) |
| `update-budget-monitor.js` | `UpdateBudgetMonitor` | Rolling-window per-owner update counter. `start()`, `stop()`, `setBudget(tag,opts)`, `clearBudgets()`, `violationCount()` (Mission 10E) |
| `source-resolver.js` | `SourceResolver`, `parseRuntimeSourceLocation`, `sanitizeSourceFile`, `SourceResolutionBasis` | Parses JS stack frame strings → `{file,line,column,functionName}` |
| `enterprise-privacy.js` | `maskUrlQuery`, `sanitizeHeaders`, `applyPrivacyPolicyToEvidenceInput`, `sanitizeForExport`, `ENTERPRISE_SAFE_PRIVACY_POLICY`, `createPrivacyPolicy`, `PrivacyAction` | Privacy redaction applied at store boundary |
| `gate.js` | `_toolEnabled`, `_getDebugFlag` | Master on/off gate. Reads `window.__LDS_DEBUG__` / `window.__LDS_INTELLIGENCE_ENABLED__`. SSR guard on line 1. |
| `workflow-verification.js` | `createWorkflowRun`, `createWorkflowBaseline`, `compareWorkflowRuns`, `verifyFix`, `MetricDirection`, `VerificationOutcome` | Before/after performance comparison framework |
| `inspector.js` | `LdsInspector` | Hover badge overlay + prop snapshot |
| `cycle-detector.js` | `LdsCycleDetector` | DFS cycle detection in update chains |
| `event-tracer.js` | `LdsEventTracer` | Custom event frequency table + timeline |
| `slow-api.js` | `LdsSlowApiMonitor` | Wraps objects to track slow method calls |
| `console.js` | `LdsConsole` | `console.error/warn` ring buffer |
| `vitals.js` | `LdsVitals` | LCP, CLS, INP, Long Tasks via PerformanceObserver |
| `network.js` | `LdsNetwork` | fetch + XHR patch, decoder plugin hook |
| `memory.js` | `LdsMemory` | Mount/unmount/GC via FinalizationRegistry |
| `perf.js` | `LdsPerfMonitor` | TTI + slow render tracking |
| `error-boundary.js` | `LdsErrorBoundary` | Wraps `performUpdate`, auto-POST crashes |
| `prop-audit.js` | `LdsPropAudit` | Render reasons (R2-A), property thrash (R2-B) |

### `src/adapter/` — Framework adapter layer

| File | Key exports | Purpose |
|------|-------------|---------|
| `FrameworkAdapter.js` | `FrameworkAdapter` | Abstract base: `emit(type,input)`, `connect(el)`, `disconnect(el)`, capabilities map |
| `lit/LitAdapter.js` | `LitAdapter`, `litAdapter` | Lit 3 concrete adapter. `connect`, `disconnect`, `recordUpdateRequested`, `recordUpdateStarted`, `recordUpdateCompleted`, `addStateChangeInterceptor` (Mission 10B), `_renderStacks` WeakMap (Mission 10A) |
| `react/ReactAdapter.js` | `ReactAdapter`, `reactAdapter` | React adapter. `onRenderStart(id,phase,actualDuration)`, `onRenderEnd(id)`, `onStateChange(id,source)`, `onError(id,err)`, `connect(id,displayName)`, `disconnect(id)` |

### `src/integration/lit/` — Lit-specific wiring

| File | Key exports | Purpose |
|------|-------------|---------|
| `LitIntelligencePipeline.js` | `LitIntelligencePipeline`, `getLitIntelligencePipeline` | Main orchestrator. `start()`, `stop()`, `resume()`, `analysis()`, `capsule()`, `cascadeReport()`, `watchManager()`, `navigationBridge()`, `networkCorrelator()`, `budgetMonitor()` |
| `property-watch-manager.js` | `PropertyWatchManager` | Per-element state intercept via `addStateChangeInterceptor`. `watch(tag,prop,opts)→unwatch`, `unwatch(tag,prop)`, `watchAll(tag,opts)` (Mission 10B) |
| `navigation-bridge.js` | `NavigationBridge` | Patches `history.pushState/replaceState`, listens `popstate`. Orphan detection after 5s delay. `start()`, `stop()`, `orphanCount()` (Mission 10C) |
| `network-state-correlator.js` | `NetworkStateCorrelator` | Temporal correlation: `NETWORK_COMPLETED` → `STATE_CHANGED` within configurable window. `start()`, `stop()`, `linkCount()` (Mission 10D) |
| `panel-intelligence-presentation.js` | `installLitIntelligencePanelPresentation` | Installs Intelligence tab into `LdsDebugPanel`. Renders cascade, property-watch, orphan, network-correlation, budget-violation, and technical-evidence sections. |
| `developer-intelligence-summary.js` | `createDeveloperIntelligenceSummary`, `createReadyDeveloperSummary` | Human-readable summary text from analysis context |
| `legacy-collector-bridge.js` | `LegacyCollectorBridge` | Bridges old `LitDebugMixin` `__LDS_SLOW_RENDERS__` into UREP `UPDATE_COMPLETED` events (P1: recordSlowRender) |
| `network-evidence-bridge.js` | `NetworkEvidenceBridge` | Bridges `LdsNetwork` events into UREP `NETWORK_STARTED`/`NETWORK_COMPLETED` events |

### `src/panel/` — Debug panel UI

| File | Key exports | Purpose |
|------|-------------|---------|
| `LdsDebugPanel.js` | `LdsDebugPanel` | 12-tab `<lds-debug-panel>` LitElement. Registers custom element. Includes Intelligence tab. |

### `src/` root

| File | Key exports | Purpose |
|------|-------------|---------|
| `index.js` | (all public exports) | Barrel export — single import point for consumers |
| `LitDebugMixin.js` | `LitDebugMixin` | Drop-in mixin. Installs all 12 tools + Intelligence pipeline on any LitElement subclass. |

### `src/future/` — Fully written, not yet wired

| File | Key exports | Purpose |
|------|-------------|---------|
| `resource-ownership-ledger.js` | `RuntimeResourceOwnershipLedger`, `ResourceStatus`, `ResourceFindingKind` | Resource lifecycle tracker. 19 tests pass. Deferred until `memory.js` emits `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED` UREP events. |

### `src/archive/` — Superseded (do not import)

| File | Notes |
|------|-------|
| `diagnostic-policy.js` | Over-abstracted gate engine. Archived — no current caller. Reconnect if dynamic per-route rule budgets become a requirement. |

---

## Data Shapes

### UREP Event (emitted to EvidenceStore, then frozen)
```js
{
  schemaVersion: '1.1',
  id:            string,           // 'evt-N' or caller-provided
  sequence:      number,           // monotonic, assigned by store
  timestamp:     number,           // Date.now() from store clock
  type:          RuntimeEventType, // see Key Constants
  framework:     { name, version, adapterVersion },
  owner: {
    id:                   string,  // 'lit-N-life-M', stable per connect()
    instanceId:           number,  // physical DOM element identity
    lifecycleGeneration:  number,  // increments on reconnect
    kind:                 'component',
    name:                 string,  // localName e.g. 'x-product-card'
    parentId:             string | null,
    connected:            boolean,
    source:               SourceLocation | null,
  } | null,
  source:      { file, line, column, functionName } | null,
  correlation: {
    causedByEventId?: string,    // → CAUSES edge
    parentEventId?:  string,     // → PARENT edge
    traceId?:        string,     // → TRACE_CONTEXT group (≥2 events needed)
    interactionId?:  string,     // → INTERACTION_CONTEXT group
  },
  evidence: {
    level:       EvidenceLevel,
    attribution: AttributionQuality,
    confidence:  number | null,  // 0–1
  },
  payload: object,               // event-specific, deep-frozen
}
```

### CascadeReport (from `CascadeAnalyzer.analyze(graph)`)
```js
{
  hasCascade:          boolean,
  rootEventId:         string,
  triggerCount:        number,  // total DEPENDENCY_TRIGGERED events
  componentCount:      number,  // distinct owners
  depth:               number,  // longest causal chain
  totalUpdateMs:       number,  // sum of cascaded UPDATE_COMPLETED durationMs
  branches: [{
    ownerId:      string,
    tag:          string,
    triggerCount: number,
    depth:        number,
  }],
  overReactingOwners: [{  // owners triggered >3 times (configurable threshold)
    ownerId:      string,
    tag:          string,
    triggerCount: number,
  }],
}
```

### Evidence Capsule (from `createEvidenceCapsule(context)`)
```js
{
  schemaVersion: string,
  session:   { id, ts, durationMs },
  incident:  { type, severity, startTs, endTs },
  finding:   { summary, rootLabel, rootCause, confidence, actionable },
  causalChain: [{ id, type, ownerId, evidenceLevel }],  // max 20 refs
  environment: {
    cascade:     CascadeReport | null,
    navigation:  { orphanCount } | null,
    network:     { linkCount } | null,
  },
  aiPrompt:  string,   // pre-formatted for LLM debugging prompt
}
```

---

## Key Constants

### `RuntimeEventType` (`src/core/evidence-protocol.js`)
| Value | String | When emitted |
|-------|--------|-------------|
| `OWNER_CREATED` | `'owner.created'` | Element `connect()` |
| `OWNER_DESTROYED` | `'owner.destroyed'` | Element `disconnect()` |
| `INTERACTION` | `'interaction'` | User interaction (manually wired) |
| `STATE_CHANGED` | `'state.changed'` | `recordUpdateRequested` / watch intercept |
| `DEPENDENCY_TRIGGERED` | `'dependency.triggered'` | Component B updated while A is mid-render |
| `UPDATE_REQUESTED` | `'component.update.requested'` | `recordUpdateRequested` |
| `UPDATE_STARTED` | `'component.update.started'` | `recordUpdateStarted` |
| `UPDATE_COMPLETED` | `'component.update.completed'` | `recordUpdateCompleted` |
| `RESOURCE_ACQUIRED` | `'resource.acquired'` | (deferred — needs memory.js wiring) |
| `RESOURCE_RELEASED` | `'resource.released'` | (deferred) |
| `NETWORK_STARTED` | `'network.started'` | `NetworkEvidenceBridge` from `LdsNetwork` |
| `NETWORK_COMPLETED` | `'network.completed'` | `NetworkEvidenceBridge` from `LdsNetwork` |
| `BROWSER_FRAME` | `'browser.frame'` | (not yet emitted) |
| `NAVIGATION` | `'navigation'` | `NavigationBridge` on route change |
| `ERROR` | `'error'` | `LitAdapter` on render crash |
| `DIAGNOSTIC` | `'diagnostic'` | Analysis bridges: cascade, orphan, network-correlation, budget-violation, watch-alert |

### `EvidenceLevel` (`src/core/evidence-protocol.js`)
```
OBSERVATION       'observation'       — Deterministic framework event; "I saw this happen"
CORRELATION       'correlation'       — Temporal proximity; "These happened near each other"
ATTRIBUTION       'attribution'       — Framework-reported causality; "This probably caused that"
LIFETIME_VIOLATION 'lifetime-violation' — Resource outlived its owner
RETAINER_CONFIRMED 'retainer-confirmed' — Reference is preventing GC
CAUSALITY_CONFIRMED 'causality-confirmed' — Proven causal link
```

### `AttributionQuality` (`src/core/evidence-protocol.js`)
| Value | When to use |
|-------|------------|
| `DETERMINISTIC` | Framework guarantees the event order |
| `FRAMEWORK_REPORTED` | Framework provides the cause (e.g. property name in requestUpdate) |
| `SOURCE_ATTRIBUTED` | Source file/line resolved from call stack |
| `TEMPORAL_INFERENCE` | Correlated by time only |
| `HEURISTIC` | Pattern-matched without framework confirmation |
| `UNKNOWN` | No attribution available |

### Window globals written by pipeline
| Global | Written by | Value |
|--------|-----------|-------|
| `window.__LDS_INTELLIGENCE_PIPELINE__` | `LitIntelligencePipeline.start()` | the pipeline instance |
| `window.__LDS_CASCADE_REPORT__` | `LitIntelligencePipeline.#publish()` | latest `CascadeReport` (or null) |
| `window.__LDS_WATCH_PROPERTY__(tag, prop, opts?)` | `LitIntelligencePipeline.start()` | fn to start property watch |
| `window.__LDS_UNWATCH_PROPERTY__(tag, prop)` | `LitIntelligencePipeline.start()` | fn to stop property watch |
| `window.__LDS_INTELLIGENCE_ENABLED__` | caller / devtools | gate flag; enables Intelligence tab rendering |

---

## Hard Rules

1. **Framework neutrality:** `src/core/` must have zero imports from `src/adapter/` or `src/integration/`. Breaking this prevents Vue/React reuse of the kernel.
2. **Evidence ladder:** Never emit `CAUSALITY_CONFIRMED` from a heuristic. Never emit `ATTRIBUTION` from temporal proximity alone — use `traceId` → `TRACE_CONTEXT` edges instead.
3. **No prototype patching:** Always patch the per-element instance (via `hookRequestUpdate(el, fn)`), never `LitElement.prototype`.
4. **SSR guard:** The first line of `_toolEnabled()` in `gate.js` MUST be `if (typeof window === 'undefined') return false`. This bug recurs.
5. **UREP immutability:** Events in the store are frozen. Never mutate an emitted event — emit a new `DIAGNOSTIC` event to link additional findings.
6. **Bounded state:** `NetworkStateCorrelator` max 20 pending; `EvidenceStore` has `maxEntries`; rolling windows prune expired entries. No unbounded Maps.
7. **Privacy at boundaries:** All URLs pass through `maskUrlQuery()` before emission. No raw query params in the store.
8. **Write to store, not to window:** New bridges must call `store.emit()` or `adapter.emit()`, never write directly to `window.__LDS_*` globals (bypasses UREP).

---

## Tests

| Test file | Covers | Tests |
|-----------|--------|-------|
| `audit-hardening.test.mjs` | LitAdapter + pipeline hardening (edge cases, error paths) | 6 |
| `baseline-compatibility.test.mjs` | LitDebugMixin + legacy globals backward compat | 4 |
| `cascade-analyzer.test.mjs` | `CascadeAnalyzer.analyze()` — fan-out, depth, over-reacting owners | 7 |
| `enterprise-privacy.test.mjs` | `maskUrlQuery`, `sanitizeHeaders`, `applyPrivacyPolicyToEvidenceInput`, `sanitizeForExport` | 12 |
| `evidence-capsule.test.mjs` | `createEvidenceCapsule`, `buildEvidenceCapsuleAIPrompt` | 3 |
| `evidence-graph.test.mjs` | CAUSES/PARENT/TRACE_CONTEXT/INTERACTION_CONTEXT edges, graph queries | 6 |
| `evidence-protocol.test.mjs` | `createEvidenceEvent`, `validateEvidenceEvent`, enum completeness | 6 |
| `foundation-hardening.test.mjs` | `EvidenceStore` + `EvidenceGraph` integration hardening | 3 |
| `incident-flight-recorder.test.mjs` | Rolling window, freeze trigger, state transitions | 8 |
| `legacy-wrapper-lifecycle.test.mjs` | `LegacyCollectorBridge` lifecycle hooks | 2 |
| `lit-adapter-v2.test.mjs` | `LitAdapter` UREP emission, `addStateChangeInterceptor`, `_renderStacks` | 3 |
| `lit-intelligence-pipeline.test.mjs` | Full pipeline: start/stop/analysis/capsule/cascadeReport | 9 |
| `navigation-bridge.test.mjs` | Route changes, orphan detection, `orphanCount()` | 8 |
| `network-evidence-bridge.test.mjs` | `NetworkEvidenceBridge` NETWORK_STARTED/COMPLETED events | 1 |
| `network-state-correlator.test.mjs` | Correlation window, expiry, traceId threading, max-pending cap | 8 |
| `package-integrity.test.mjs` | `src/index.js` exports all expected symbols | 2 |
| `property-watch-manager.test.mjs` | Watch/unwatch, call stack capture, threshold DIAGNOSTIC | 7 |
| `react-adapter.test.mjs` | `ReactAdapter` full lifecycle — OWNER, STATE, UPDATE, ERROR events | 16 |
| `root-cause-review-hardening.test.mjs` | `RootCauseGrouper` scoring stability and edge cases | 3 |
| `source-resolver.test.mjs` | `parseRuntimeSourceLocation`, `sanitizeSourceFile` | 8 |
| `update-budget-monitor.test.mjs` | Rolling window, per-tag budgets, `violationCount()`, `stop()` | 9 |
| `workflow-verification.test.mjs` | `createWorkflowRun`, `compareWorkflowRuns`, `verifyFix` | 8 |
| **Total (22 active files)** | | **139** |
| `archive/diagnostic-policy.test.mjs` | Archived `DiagnosticPolicyEngine` | 13 |
| `future/resource-ownership-ledger.test.mjs` | `RuntimeResourceOwnershipLedger` (not yet wired) | 10 |

Run tests: `node --test test/unit/*.test.mjs`

---

## Current Status

| Area | Status |
|------|--------|
| Missions 01–10E | ✅ Complete |
| 139 active unit tests | ✅ All pass |
| P0 browser validation | ⏳ Pending (manual — `npm link` into UI Platform, trigger slow render + error, confirm Intelligence tab) |
| Mission 11 Vue adapter | ⏳ After P0 |
| `network.js` / `perf.js` / `memory.js` → UREP migration | ⏳ Deferred (these still write to `__LDS_*` globals only) |
| `ResourceOwnershipLedger` wiring | ⏳ Deferred (needs `memory.js` to emit `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED`) |
| `window.__LDS_SET_UPDATE_BUDGET__` global | ⏳ Deferred (`budgetMonitor().setBudget()` via pipeline accessor works in meantime) |
| `panel-intelligence-presentation.js` `_completeReplay()` coupling | ⏳ Deferred (replace with `lds-replay-complete` event hook) |
| Evidence capsule `aiPrompt` quality | ⏳ Deferred (improve structured problem framing after field validation) |
