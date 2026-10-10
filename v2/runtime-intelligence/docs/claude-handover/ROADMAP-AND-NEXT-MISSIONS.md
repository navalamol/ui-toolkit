# Runtime Intelligence — Roadmap and Next Missions

Last updated: 2026-10-10

---

## Strategic direction (confirmed)

The system is intentionally **generic**: Lit + React now, Angular/Vue eventually. Do not narrow it back to Lit-only.

Core product constraint:
> The tool must feel simpler than the problem it is helping debug.

Progression gate:
> Before adding more architecture, prove that a developer using Lit/UI Platform can say: *"The baseline showed symptoms, but Intelligence connected them and gave me the right place to investigate faster."*

---

## Architecture layers (current state)

```
UREP core (keep)
├── evidence-protocol.js       — event schema, evidence ladder
├── evidence-store.js          — bounded rolling store
├── evidence-graph.js          — causal + structural graph
├── root-cause.js              — grouper + scoring (FIXED this session)
├── incident-flight-recorder.js — bounded freeze/resume
├── evidence-capsule.js        — privacy-filtered AI export
├── enterprise-privacy.js      — sanitization boundary
└── source-resolver.js         — file:line attribution

Framework adapters (keep, React coming soon)
├── FrameworkAdapter.js        — generic base
├── adapter/lit/LitAdapter.js  — Lit lifecycle → UREP
└── adapter/react/ReactAdapter.js — React → UREP (ready for React work)

Lit integration (keep + maintain)
├── LitIntelligencePipeline.js        — orchestrator
├── legacy-collector-bridge.js        — LdsErrorBoundary → UREP
├── network-evidence-bridge.js        — network log → UREP
├── developer-intelligence-summary.js — human-readable finding (FIXED this session)
└── panel-intelligence-presentation.js — Intelligence tab (FIXED this session)

Deferred (archive/ and future/)
├── src/archive/diagnostic-policy.js  — over-abstracted gate; reconnect if dynamic budgets needed
└── src/future/resource-ownership-ledger.js — resource lifetime violations; reconnect after memory.js UREP bridge
```

---

## Missions 10A–10E — Developer Pain Point Series

These five missions extend the tool beyond slow-render/error detection into the hardest daily
developer problems. Each is independently releasable. All emit standard UREP events — the core
(EvidenceGraph, RootCauseGrouper, IncidentFlightRecorder) processes them identically for
Lit, React, and Vue.

| Mission | Status | Pain solved | Key file |
|---|---|---|---|
| **10B** Property Watch | ✅ Done | "Where is this property being set?" | `property-watch-manager.js` |
| **10A** Cascade Tracker | Queued | "Why did 20 components re-render?" | `cascade-analyzer.js` |
| **10C** Navigation+Orphan | Queued | "What's leaking after route change?" | `navigation-bridge.js` |
| **10D** Network→State | Queued | "Which API call caused this spike?" | `network-state-correlator.js` |
| **10E** Update Budget | Queued | "Something is over-reacting" | `update-budget-monitor.js` |

See `lit/CLAUDE.md` for the full mission spec structure and `lit/docs/MISSION-10B-*.md` for an
example of a completed mission doc.

### Protocol events waiting to be wired (emit before defining new types)
`DEPENDENCY_TRIGGERED` (10A), `NAVIGATION` (10C), `INTERACTION` (future), `BROWSER_FRAME` (future)

---

## Immediate next missions

### Mission A — Real UI Platform validation (P0, not yet done)

**This is the highest priority before any new features.**

Run two specific scenarios in UI Platform with `npm link`:

**Scenario 1: Runtime error**
1. Enable: `window.__LDS_INTELLIGENCE_ENABLED__ = true; window.__LDS_DEBUG__ = true`
2. Trigger a known RufElement render error
3. Open the `✨ Intelligence` tab
4. Check: does "Problem" show the correct component? Does "Strongest signal" (new label after this session's fix) name something genuinely related?

**Scenario 2: Slow render**
1. Force a >500ms Lit update
2. Open Intelligence tab
3. Check: does the component shown match what was actually slow? Is the label honest ("Strongest signal" for correlated, "Likely cause" only for attributed)?

If both scenarios produce trustworthy output → expand. If not → audit scoring further.

### Mission B — perf.js slow renders bridged to UREP (P1)

`perf.js` currently writes to `window.__LDS_SLOW_RENDERS__` only. It never emits UREP events.

**What to add in `legacy-collector-bridge.js`:**

```js
export function recordSlowRender({ component, durationMs, timestamp, source }) {
  const store = evidenceStore;
  store.emit({
    type: RuntimeEventType.UPDATE_COMPLETED,
    framework: { name: 'lit' },
    owner: { id: component, name: component, lifecycleGeneration: 1 },
    evidence: {
      level: EvidenceLevel.ATTRIBUTION,
      attribution: AttributionQuality.FRAMEWORK_REPORTED,
      confidence: 0.9,
    },
    source: source || null,
    payload: { durationMs },
  });
}
```

Then call `recordSlowRender()` from `perf.js` when it detects a slow render. This means slow renders become first-class UREP evidence and can participate in root-cause scoring.

### Mission C — `_toolEnabled('intelligence')` gate on panel bridge (P2)

`panel-intelligence-presentation.js` currently installs the Intelligence tab unconditionally.

Add gate check:
```js
// In installLitIntelligencePanelPresentation()
if (!_toolEnabled('intelligence') && !target?.__LDS_INTELLIGENCE_PIPELINE__) return false;
```

This ensures the tab only appears when Intelligence is actually enabled.

### Mission D — React adapter work (user-directed, no date yet)

`ReactAdapter.js` is active and ready. When the user decides to start React work:
1. Wire `ReactAdapter` into a `ReactIntelligencePipeline` (similar to `LitIntelligencePipeline`)
2. Bridge React error boundaries → UREP
3. Bridge React profiler renders → UREP
4. Evidence ladder is already generic — no changes needed there

Start here only when the user explicitly starts a React consumer project.

---

## Missions 12A–12E — Opportunities Advisor Series (2026-10-10)

Five new structural/optimization advisors surfaced in a **dedicated "⚡ Opportunities" tab**
(separate from Intelligence, which stays focused on incident-level root-cause analysis).

All five advisors live in `src/core/` with zero framework imports — fully reusable by React/Vue.
All emit `RuntimeEventType.DIAGNOSTIC` to the evidence store following the UREP evidence ladder.

A new panel file `src/integration/lit/panel-opportunities-presentation.js` (created in 12A)
hosts all five section renderers and injects the tab using the same prototype-patch mechanism as
`panel-intelligence-presentation.js`.

| Mission | Status | Pain solved | Key file |
|---|---|---|---|
| **12A** DomDuplication | OPEN | `<x-tooltip>` × 47 per item instead of 1 shared | `dom-duplication-advisor.js` |
| **12B** Virtualization | OPEN | "which component needs virtual scroll + how many off-screen" | `virtualization-advisor.js` |
| **12C** PaintAdvisor | OPEN | FP/FCP timing + expensive CSS (filter/backdrop-filter) | `paint-advisor.js` |
| **12D** WorkerOpportunity | OPEN | Long task after large network response = Worker candidate | `worker-opportunity-advisor.js` |
| **12E** IdleScheduling | OPEN | Background update with no user gesture = requestIdleCallback candidate | `idle-scheduling-advisor.js` |

Implementation order: 12A → 12B → 12C → 12D → 12E  
(12A also creates `panel-opportunities-presentation.js` with stubs for 12B–12E)

Full specs: `docs/MISSION-12A-DOM-DUPLICATION.md` through `docs/MISSION-12E-IDLE-SCHEDULING-ADVISOR.md`  
Feature docs: `docs/features/13-dom-duplication-advisor.md` through `docs/features/17-idle-scheduling-advisor.md`

### Methodology decisions (non-negotiable for these missions)
- WorkerOpportunityAdvisor subscribes to `NETWORK_COMPLETED` store events, NOT `window.__LDS_NETWORK_LOG__`
- VirtualizationAdvisor uses `MutationObserver` + 300ms debounce (not a timer interval)
- PaintAdvisor defers layout-thrash sub-detector to Mission 12F (too many false positives without adapter instrumentation)
- IdleSchedulingAdvisor uses `STATE_CHANGED` as interaction proxy until `INTERACTION` events are wired
- No `Element.prototype` patching anywhere in this series

---

## Deferred missions (do not start yet)

| Mission | Why deferred |
|---|---|
| Reconnect `resource-ownership-ledger.js` from `src/future/` | Needs `memory.js` to emit `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED` UREP events first |
| Event tracer → UREP bridge | High noise risk; defer until causal accuracy proven |
| Dynamic enable/disable after page load | Complex patch/unpatch; defer until needed |
| Vue / Angular adapters | No consumer; defer after React is proven |
| Rich causal timeline visualization | Beautiful but dangerous if scoring is wrong; defer until accuracy proven |
| AI handoff improvements | `exportCapsule()` already works; improvements defer until UX is stable |

---

## Architectural invariants (never break)

1. **Generic intelligence is additive** — never remove/hide Lit/Main Platform surfaces
2. **Evidence ladder** (ascending): observation < correlation < attribution < lifetime-violation < retainer-confirmed < causality-confirmed
3. **`_reachable()` uses CAUSES + PARENT only in graph traversal** — IC/TC edges must not inflate anchor scores
4. **`gate.js` is read-only** — `_toolEnabled()` must never write to `window`, only read. SSR guard MUST be first line.
5. **Privacy at capture and export boundaries** — does not change evidence semantics
6. **Recorder starts before adapter.connect()** — do not regress this ordering
7. **Slow render analysis does not freeze the recorder** — a later crash must still be capturable as a stronger incident
8. **Structural ancestry does not equal causation** — root-cause scoring weights explicit CAUSES edges far above PARENT tree position

---

## Known recurring bug to watch

**`gate.js` force-write regression.** The other AI has re-introduced this bug at least twice. Every review session should check `_toolEnabled()` starts with `if (typeof window === 'undefined') return false;` and contains NO write lines before that guard.

Run: `npm test` — if `diagnostic gate is SSR-safe and does not force-enable tools` fails, gate.js has the bug again.
