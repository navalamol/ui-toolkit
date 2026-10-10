# CLAUDE.md — Runtime Intelligence: Engineering Operating Guide

> Engineering operating contract. Read in 2 minutes. Follow exactly.
> Version: 2026-10-10

---

## Context loading order (staged — stop early)

**Stage 1 — always read:**
- `PRODUCT.md` — what this is, the product promise, north star, done criteria
- `DECISIONS.md` — priority stack, 70/20 filter, architectural decision log
- `KILL_LIST.md` — anti-patterns, deferred features, recurring bugs

**Stage 2 — read for the current mission:**
- `docs/claude-handover/ROADMAP-AND-NEXT-MISSIONS.md` — live mission queue
- The specific mission doc (e.g., `docs/MISSION-NN-NAME.md`)

**Stage 3 — read only the files you will modify.** Never dump a directory.

---

## Architecture in 90 seconds

```
Browser runtime
      │ Lit/React/Vue framework events
      ▼
Framework Adapter         src/adapter/lit/LitAdapter.js
      │ emits UREP events
      ▼
Evidence Store            src/core/evidence-store.js
      │ subscribe + snapshot
      ▼
Incident Flight Recorder  src/core/incident-flight-recorder.js
      │ frozen incident
      ▼
Evidence Graph            src/core/evidence-graph.js
      │ CAUSES / PARENT / TRACE_CONTEXT / INTERACTION_CONTEXT edges
      ▼
Root Cause Grouper        src/core/root-cause.js
      │ clusters with strength + rootLabel
      ▼
LitIntelligencePipeline   src/integration/lit/LitIntelligencePipeline.js
      │ summary + capsule + advisor wiring
      ▼
panel-*-presentation.js   Intelligence tab + Opportunities tab
```

**Key law:** `src/core/` is framework-neutral — zero framework imports. Lit-specific code lives
only in `src/adapter/lit/` and `src/integration/lit/`. A Vue adapter reuses core unchanged.

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

Rules classify evidence. Never emit `CAUSALITY_CONFIRMED` from a heuristic.
Never emit `ATTRIBUTION` from temporal proximity alone.

---

## The short loop (every mission)

```
1. Read CLAUDE.md + PRODUCT.md + KILL_LIST.md
2. Read the mission doc
3. Identify reusable infrastructure — never duplicate
4. Write the feature doc FIRST (docs/features/NN-name.md)
5. Implement: new file → tests → wire into pipeline → panel section
6. Run: node --test test/unit/*.test.mjs  (all must pass)
7. Update docs/claude-handover/ROADMAP-AND-NEXT-MISSIONS.md
```

---

## Every mission requires these 4 artifacts

| Artifact | Where |
|---|---|
| Feature doc | `docs/features/NN-name.md` |
| Mission doc | `docs/MISSION-NN-NAME.md` |
| Implementation | `src/` — new file or minimal modification |
| Test suite | `test/unit/name.test.mjs` — ≥5 tests |

Missing any → mission is not done.

---

## File map

| Need to… | Look in |
|---|---|
| Add event type | `src/core/evidence-protocol.js` → `RuntimeEventType` |
| Add a gate flag | `src/core/gate.js` → `_toolEnabled` + update JSDoc |
| Wire a new bridge | `src/integration/lit/` — create `X-bridge.js` |
| Add to Intelligence tab | `src/integration/lit/panel-intelligence-presentation.js` |
| Add to Opportunities tab | `src/integration/lit/panel-opportunities-presentation.js` |
| Add a framework-neutral analyzer | `src/core/` — zero framework imports |
| Expose a public API | `src/index.js` — barrel export |
| Add a tool to the panel | `src/panel/LdsDebugPanel.js` → `TABS` array + `_renderContent` |
| React adapter | `src/adapter/react/ReactAdapter.js` |
| Wired but inactive features | `src/future/` — check tests before wiring |

---

## Test patterns

```js
import test from 'node:test';
import assert from 'node:assert/strict';
// Real store + real adapter — never mock
const store = new EvidenceStore({ maxEntries: 50 });
const adapter = new LitAdapter({ store });
const el = { localName: 'x-thing', requestUpdate() {}, performUpdate() {} };
// Always clean up
test.afterEach(() => { pipeline.stop(); store.clear(); });
```

Node built-in `node:test` + `node:assert/strict`. No external framework.
Every test: `pipeline.stop()` or `store.clear()` at the end. No shared state.

---

## Gate checklist (before marking done)

- [ ] All existing tests still pass (`node --test test/unit/*.test.mjs`)
- [ ] ≥5 new tests cover all spec assertions
- [ ] `gate.js` SSR guard present: `if (typeof window === 'undefined') return false`
- [ ] No prototype patching (instance patching only)
- [ ] New public exports added to `src/index.js`
- [ ] Feature doc in `docs/features/`
- [ ] ROADMAP updated
- [ ] Panel section renders without errors when feature is disabled
- [ ] Check KILL_LIST.md recurring bugs before closing

---

## Context budget

- Read only what you will modify
- The 90-second diagram above replaces ARCHITECTURE.md
- `EvidenceLevel`, `AttributionQuality`, `RuntimeEventType` enums are stable — use from memory
- Soft warn at 80k tokens; hard warn at 120k tokens

---

## Roadmap snapshot

| Mission | Status | Key file |
|---|---|---|
| 01–09.5 | ✅ | Full UREP pipeline, Lit + React adapters, privacy, capsule |
| P1 recordSlowRender | ✅ | `legacy-collector-bridge.js` |
| P2 intelligence gate | ✅ | `LitIntelligencePipeline.js` |
| 10A Cascade Tracker | ✅ | `cascade-analyzer.js` |
| 10B Property Watch | ✅ | `property-watch-manager.js` |
| 10C Navigation/Orphan | ✅ | `navigation-bridge.js` |
| 10D Network→State | ✅ | `network-state-correlator.js` |
| 10E Update Budget | ✅ | `update-budget-monitor.js` |
| 12A–12E Opportunities | ✅ | 5 advisors + `panel-opportunities-presentation.js` |
| **P0 Browser Validation** | ⚠ PENDING | Manual: npm link → trigger → verify Intelligence tab |
| Mission 13+ | After P0 | See ROADMAP-AND-NEXT-MISSIONS.md |

**P0 is the gate.** No new features until browser validation confirms finding quality.

---

## Strategic docs

- `PRODUCT.md` — what it is, north star, persona, done criteria, risks, archive plan
- `DECISIONS.md` — priority stack, 70/20 filter, architectural decision log
- `KILL_LIST.md` — anti-patterns, deferred features, recurring bugs
