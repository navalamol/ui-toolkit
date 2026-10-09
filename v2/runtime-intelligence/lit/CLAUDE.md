# CLAUDE.md — Runtime Intelligence: AI Development Guide

> Read this before touching any file. It is the operating contract for AI-assisted work here.
> Version: 2026-10-10 | Owner: Chief AI Officer

---

## What this codebase builds

A **live, in-browser developer tool** that tells you *why* your UI is broken or slow — not just
that it is. It runs on the developer's machine with full framework access, giving it capabilities
that Lighthouse (synthetic, cold-boot, no framework semantics) can never have.

**The product promise:**
> After reproducing a bug, a developer opens the Intelligence tab and reads: problem → likely cause → source location → what to do next. No log scanning, no console.log archaeology.

---

## Architecture in 90 seconds

```
Browser runtime
      │ Lit/React/Vue framework events
      ▼
Framework Adapter (src/adapter/lit/LitAdapter.js)
      │ emits UREP events
      ▼
Evidence Store (src/core/evidence-store.js)   ← bounded, immutable, privacy-filtered
      │ subscribe + snapshot
      ▼
Incident Flight Recorder (src/core/incident-flight-recorder.js)  ← rolling + freeze
      │ frozen incident
      ▼
Evidence Graph (src/core/evidence-graph.js)   ← causal DAG
      │ CAUSES / PARENT / TRACE_CONTEXT / INTERACTION_CONTEXT edges
      ▼
Root Cause Grouper (src/core/root-cause.js)   ← scoring (heuristic, not ML)
      │ clusters with strength + rootLabel
      ▼
LitIntelligencePipeline (src/integration/lit/LitIntelligencePipeline.js)
      │ developer summary + evidence capsule
      ▼
panel-intelligence-presentation.js            ← Intelligence tab in LDS panel
```

**Key law:** framework-specific code lives ONLY in `src/adapter/` and `src/integration/lit/`.
Everything in `src/core/` is framework-neutral. A new Vue adapter reuses core unchanged.

---

## The 70/20 Rule (non-negotiable)

Before building anything, ask:
1. **Would 80% of developers hit this pain point?** No → defer.
2. **Does existing infrastructure handle it?** Yes → wire, don't build.
3. **Is it one file + one test suite?** No → split the mission.
4. **Is there a protocol event type for it already?** Yes → emit it. No new types without review.

Already-defined protocol events waiting to be wired: `DEPENDENCY_TRIGGERED`, `NAVIGATION`,
`INTERACTION`, `BROWSER_FRAME`. Emit these before defining new ones.

---

## Evidence Ladder (never violate)

```
OBSERVATION          ← "I saw this happen" — deterministic framework events
CORRELATION          ← "These happened near each other" — temporal proximity
ATTRIBUTION          ← "This probably caused that" — framework-reported causality
LIFETIME_VIOLATION   ← "This resource outlived its owner"
RETAINER_CONFIRMED   ← "This reference is preventing GC"
CAUSALITY_CONFIRMED  ← "I have proof this caused that"
```

**Rules classify evidence. They do not manufacture stronger evidence.**
Never emit `CAUSALITY_CONFIRMED` from a heuristic. Never emit `ATTRIBUTION` from temporal proximity alone.

---

## Working here: the short loop

```
1. Read CLAUDE.md (this file) + relevant MISSION doc
2. Identify reusable infrastructure (never duplicate)
3. Write the feature doc FIRST (docs/features/NN-name.md)
4. Implement: new file → tests → wire into pipeline → panel section
5. Run: node --test test/unit/*.test.mjs (all tests must pass)
6. Update ROADMAP-AND-NEXT-MISSIONS.md
```

Never implement before reading what exists. The exploration saves tokens; re-implementing existing
code wastes them.

---

## Every feature requires these 4 artifacts

| Artifact | Where | Content |
|---|---|---|
| Feature doc | `docs/features/NN-name.md` | Pain solved, API surface, window globals, known limits |
| Mission doc | `docs/MISSION-NN-NAME.md` | Spec, constraints, test cases, framework extension path |
| Implementation | `src/` | New file or minimal modification to existing |
| Test suite | `test/unit/name.test.mjs` | ≥5 targeted tests matching the mission spec exactly |

If any of the four is missing, the mission is not done.

---

## Feature doc template (copy and fill)

```markdown
# Feature Name (NN)

## Pain solved
One sentence: what developer problem disappears.

## Enable
window.__LDS_FEATURE_ENABLED__ = true
or window.__LDS_DEBUG__ = { featureKey: true }

## Window API
window.__LDS_THING__(args)   — what it does
window.__LDS_THING_RESULT__  — what it writes

## What it emits
RuntimeEventType.X — EvidenceLevel.Y — when

## Known limits / future work
- Limitation A (deferred because reason)
- Limitation B
```

---

## Mission doc template (for the developer to implement)

```markdown
# Mission NN — Feature Name

## Pain
One sentence.

## Existing infrastructure to reuse
- `path/to/file.js` — specific method to call

## What to build
### New file: `src/path/name.js`
[class + methods with exact signatures]

### Modify: `src/path/existing.js`
[exact addition, minimal diff]

## Constraints
- MUST NOT ...
- payload.X is mandatory because ...

## Tests (exact assertions)
1. scenario → expected behavior
2. scenario → expected behavior
...

## Framework extension path
How React/Vue would wire this (1 paragraph)
```

---

## File map (where to find things)

| Need to... | Look in |
|---|---|
| Add a new event type | `src/core/evidence-protocol.js` → `RuntimeEventType` |
| Add a new gate flag | `src/core/gate.js` → add to `_toolEnabled` + update JSDoc |
| Wire a new bridge | `src/integration/lit/` — create `X-bridge.js` |
| Add to Intelligence tab | `src/integration/lit/panel-intelligence-presentation.js` |
| Add a framework-neutral analyzer | `src/core/` — new file, zero framework imports |
| Expose a public API | `src/index.js` — barrel export |
| Add a tool to the panel | `src/panel/LdsDebugPanel.js` → `TABS` array + `_renderContent` map |
| Understand what React already has | `src/adapter/react/ReactAdapter.js` |
| Use an almost-finished future feature | `src/future/` — check tests before wiring |

---

## Anti-patterns (proven to cause re-work)

| Anti-pattern | Why bad | Do instead |
|---|---|---|
| Patching `LitElement.prototype` | Affects all elements, not per-owner | Use `hookRequestUpdate(el, fn)` per instance |
| Writing to `window.__LDS_*` from a new bridge | Bypasses UREP | `store.emit()` or `adapter.emit()` |
| `causedByEventId` on temporal proximity | Manufactures causal evidence | Use `traceId` → `TRACE_CONTEXT` edges (correlation) |
| Intercepting fetch/XHR directly | Already done in `network.js` | `LdsNetwork.subscribe(fn)` |
| `gate.js` writes before SSR guard | Breaks SSR; this bug recurs | First line of `_toolEnabled` MUST be `if (typeof window === 'undefined') return false` |
| Structural `parentEventId` upgrading cluster strength | Already fixed in pre-10 audit | PARENT edges are correlation-level only |
| New module importing from `LitAdapter` in `src/core/` | Breaks framework neutrality | Core reads UREP events only |

---

## Test patterns

All tests use Node's built-in `node:test` + `node:assert/strict`. No external test framework.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
// Always use real EvidenceStore + real LitAdapter in unit tests
// Never mock the store — integration is the point
const store = new EvidenceStore({ maxEntries: 50 });
const adapter = new LitAdapter({ store });
// Fake element
const el = { localName: 'x-thing', requestUpdate() {}, performUpdate() {} };
```

Every test: `pipeline.stop()` or `store.clear()` at the end. No shared state between tests.

---

## Gate checklist (before marking a mission done)

- [ ] All 100+ existing tests still pass
- [ ] New tests cover all spec assertions (min 5)
- [ ] `gate.js` not modified without SSR guard check
- [ ] No prototype patching (instance patching only)
- [ ] New file exports are added to `src/index.js` if public
- [ ] Feature doc created in `docs/features/`
- [ ] ROADMAP updated
- [ ] Panel section renders without errors when feature is disabled

---

## Context budget rules (token efficiency)

- **Never re-read ARCHITECTURE.md in full** — the 90-second summary above is sufficient
- **Read only the files you will modify** — targeted reads, not directory dumps
- **Evidence capsule shape** — already in exploration; don't re-read evidence-capsule.js
- **Protocol enums** — `EvidenceLevel`, `AttributionQuality`, `RuntimeEventType` are stable; use from memory
- **Tests needing adapters** — real adapter + real store is 5 lines, not a complex setup

---

## Roadmap at a glance

| Mission | Status | Key file |
|---|---|---|
| 01–09.5 | ✅ Done | Full UREP pipeline, Lit + React adapters, privacy, capsule |
| P1 recordSlowRender | ✅ Done | `legacy-collector-bridge.js` |
| P2 intelligence gate | ✅ Done | `LitIntelligencePipeline.js` |
| **10B Property Watch** | ✅ Done | `property-watch-manager.js` |
| **10A Cascade Tracker** | ✅ Done | `cascade-analyzer.js` |
| **10C Navigation/Orphan** | ✅ Done | `navigation-bridge.js` |
| **10D Network→State** | ✅ Done | `network-state-correlator.js` |
| **10E Update Budget** | ✅ Done | `update-budget-monitor.js` |
| P0 Browser Validation | Pending | Manual (npm link + trigger) |
| Mission 11 Vue | After P0 | `src/adapter/vue/VueAdapter.js` |

---

## Known improvement areas (track here, not in code)

- `panel-intelligence-presentation.js` wraps `_completeReplay()` private method — replace with
  `lds-replay-complete` event hook in a future panel-integration milestone
- `DiagnosticPolicy` archived — reconnect if dynamic per-route rule budgets are needed
- `network.js` + `perf.js` + `memory.js` still write to `__LDS_*` globals only — full UREP
  migration needed before v1 release claim
- `ResourceOwnershipLedger` in `src/future/` is fully tested — wire when `memory.js` emits
  `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED`
- Evidence capsule `aiPrompt` field is auto-generated — improve with structured problem framing
  once finding quality is validated in production
