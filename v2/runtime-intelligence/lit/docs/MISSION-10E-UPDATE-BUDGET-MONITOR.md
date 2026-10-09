# Mission 10E — Update Budget Monitor

**Status:** ✅ Complete — 2026-10-10

## Pain
A developer sets one property and many components re-render. Something is over-reacting to state changes it doesn't need. Without tooling, identifying the culprit requires manually adding counters everywhere.

## Existing infrastructure reused
- `RuntimeEventType.UPDATE_COMPLETED` — already emitted by `LitAdapter.recordUpdateCompleted()` with `durationMs`
- `RuntimeEventType.DIAGNOSTIC` — same pattern as 10B/10C/10D
- `EvidenceLevel.CORRELATION` + `AttributionQuality.TEMPORAL_INFERENCE` — correct for rolling-window observation
- `EvidenceStore.subscribe(fn)` — used for event streaming (no snapshot needed, purely reactive)

## What was built

### New: `src/core/update-budget-monitor.js`
Framework-neutral `UpdateBudgetMonitor` class. Zero imports from any framework adapter.

- Constructor: `{ store, budget={countPerWindow:5, windowMs:100}, onViolation? }`
- `start()`: subscribes to store
- `stop()`: unsubscribes, clears rolling windows
- `setBudget(tagName, { countPerWindow, windowMs })`: per-tag budget override
- `clearBudgets()`: removes all per-tag overrides (default applies)
- `violationCount()`: total DIAGNOSTICs emitted

Rolling window algorithm (per owner):
1. On `UPDATE_COMPLETED`: push `{ timestamp: now }` to owner's window array
2. Prune entries older than `now - windowMs`
3. If `pruned.length > countPerWindow` → emit `DIAGNOSTIC{budgetViolation:true}`
4. Per-tag budget checked first; falls back to default budget

### Modified: `src/integration/lit/LitIntelligencePipeline.js`
- Import + instantiate `UpdateBudgetMonitor` as `#budgetMonitor`
- `start()`: `this.#budgetMonitor?.start()`
- `stop()`: `this.#budgetMonitor?.stop()`
- Added `budgetMonitor()` public accessor

### Modified: `src/integration/lit/panel-intelligence-presentation.js`
- Added `_renderBudgetViolationSection(target)` — reads budget violation DIAGNOSTICs from `__LDS_EVIDENCE_STORE__`, deduplicates by tag (worst updateCount), renders collapsible `<details>`: "N components exceeded update budget"

### Modified: `src/index.js`
- Added `export { UpdateBudgetMonitor } from './core/update-budget-monitor.js'`

## Constraints observed
- `UpdateBudgetMonitor` has zero imports from any framework adapter — in `src/core/`, framework-neutral
- `DIAGNOSTIC` uses `EvidenceLevel.CORRELATION` (rolling-window observation, not causal)
- `causedByEventId` references the triggering `UPDATE_COMPLETED` — CAUSES edge in EvidenceGraph

## Tests
`test/unit/update-budget-monitor.test.mjs` — 9 tests:
1. Exactly at budget → no DIAGNOSTIC
2. One over budget → DIAGNOSTIC with budgetViolation, tag, updateCount, windowMs, totalMs
3. Per-tag override: strict tag fires, lenient tag does not
4. Rolling window: old entries outside windowMs are pruned (clock-controlled)
5. `stop()` unsubscribes — no further DIAGNOSTICs
6. `violationCount()` tracks total
7. DIAGNOSTIC has `causedByEventId` → valid UPDATE_COMPLETED in store
8. Constructor throws on invalid store
9. `clearBudgets()` restores lenient default

## Framework extension path
- **React / Vue**: Zero changes needed — `UpdateBudgetMonitor` subscribes to `UPDATE_COMPLETED`, which React/Vue adapters will emit from their own render-complete hooks. Fully framework-neutral.

## Known improvement areas
- One DIAGNOSTIC per excess update can be noisy — debounce to one summary per window in a future pass
- Expose `window.__LDS_SET_UPDATE_BUDGET__` global as per original plan (deferred — `budgetMonitor().setBudget()` achieves the same via the pipeline accessor)
