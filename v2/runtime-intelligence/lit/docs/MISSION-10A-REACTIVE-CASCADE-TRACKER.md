# Mission 10A — Reactive Cascade Tracker

**Status:** ✅ Complete — 2026-10-10

## Pain
Developer clicks one button and N components re-render — no visibility into which components or why without adding console.log to every `updated()`.

## Existing infrastructure reused
- `RuntimeEventType.DEPENDENCY_TRIGGERED` — already in `evidence-protocol.js`, never emitted before this mission
- `EvidenceGraph` CAUSES edges — auto-built from `causedByEventId` in DEPENDENCY_TRIGGERED correlation
- `EvidenceLevel.ATTRIBUTION` + `AttributionQuality.FRAMEWORK_REPORTED` — correct for framework-observed cascade
- `LitAdapter.recordUpdateRequested/Started/Completed` — all three lifecycle points wired

## What was built

### Modified: `src/adapter/lit/LitAdapter.js`
- Added `_renderStacks = new WeakMap()` (per-adapter-instance) + `_getStack(adapter)` helper
- In `recordUpdateStarted`: push `{ el, ownerId, startEventId }` to adapter's render stack
- In `recordUpdateCompleted`: pop by `el` reference from render stack
- In `disconnect`: pop from render stack (cleanup for incomplete updates)
- In `recordUpdateRequested`: check render stack; if non-empty and `parent.el !== el`, emit `DEPENDENCY_TRIGGERED` with `causedByEventId: parent.startEventId`, `confidence: 0.85`

### New: `src/core/cascade-analyzer.js`
Framework-neutral `CascadeAnalyzer` class. `analyze(graph) → CascadeReport | null`.

Algorithm:
1. Filter `DEPENDENCY_TRIGGERED` events from `graph.nodes()`; return null if none
2. Build `startIdToTriggers` map (UPDATE_STARTED.id → DEPENDENCY_TRIGGERED[])
3. Build `ownerIdToLastStartId` map for tree traversal
4. Find cascade root start event (UPDATE_STARTED with no incoming cascade trigger)
5. Compute `depth` recursively with memoization
6. Count per-owner trigger occurrences; identify `overReactingOwners` (count > threshold)
7. Sum `totalUpdateMs` from cascaded owners' UPDATE_COMPLETED events
8. Return frozen `CascadeReport`

### Modified: `src/integration/lit/LitIntelligencePipeline.js`
- Import + instantiate `CascadeAnalyzer` as `#cascadeAnalyzer`
- In `#analyze()`: `const cascade = this.#cascadeAnalyzer.analyze(graph)` → `this.#latestCascade`
- Added `cascadeReport()` public method
- `#publish()` writes `window.__LDS_CASCADE_REPORT__`
- `resume()` clears `#latestCascade`
- `#buildCapsule` includes `cascade` in `environment` block

### Modified: `src/integration/lit/panel-intelligence-presentation.js`
- Added `_renderCascadeSection(target)` — reads `target.__LDS_CASCADE_REPORT__`, renders collapsible `<details>` showing: component count, depth, totalUpdateMs, per-component breakdown, over-reacting warnings
- Called from `_renderIntelligenceTab` between finding section and technical evidence

### Modified: `src/index.js`
- Added `export { CascadeAnalyzer } from './core/cascade-analyzer.js'`

## Constraints observed
- `CascadeAnalyzer` has zero imports from any adapter — framework-neutral per CLAUDE.md
- `DEPENDENCY_TRIGGERED` uses `EvidenceLevel.ATTRIBUTION` (framework-reported, not causal proof)
- Render stack uses `WeakMap` keyed by adapter instance — multi-adapter tests don't interfere

## Tests
`test/unit/cascade-analyzer.test.mjs` — 7 tests:
1. Single component update → null (no cascade)
2. A triggers B and C → componentCount ≥ 2, depth ≥ 1
3. Chained A→B→C → depth ≥ 2
4. Component triggered >3 times → appears in `overReactingOwners`
5. `totalUpdateMs` sums only cascaded UPDATE_COMPLETED durations
6. `branches` sorted by ascending depth
7. `CascadeReport` and its arrays are frozen

## Framework extension path
- **React**: `ReactAdapter` emits `DEPENDENCY_TRIGGERED` from Profiler `onRender` when a child commit traces back to a parent's state update. `CascadeAnalyzer` unchanged.
- **Vue**: `VueAdapter` emits `DEPENDENCY_TRIGGERED` via `watchEffect` dependency tracking. `CascadeAnalyzer` unchanged.
- Core `cascade-analyzer.js` requires no modification for any framework.

## Known improvement areas
- Async cascade detection (setTimeout/microtask chains) — out of scope; no false positives from current approach
- Per-project `overReactingThreshold` configuration — expose via constructor option if requested
- Historical cascade timeline view — currently shows only latest; full history via `exportCapsule()`
