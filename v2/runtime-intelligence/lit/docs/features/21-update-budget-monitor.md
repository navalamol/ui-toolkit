# Update Budget Monitor (21)

## Pain solved
A developer sets one property and 20 components re-render. Something is over-reacting to state changes it doesn't need. Without tooling, identifying which component is the culprit requires manually adding counters everywhere.

## Enable
Starts automatically with `LitIntelligencePipeline.start()`. No additional flag required. The over-rendering section appears in the Intelligence tab when violations are detected.

## Window API
`window.__LDS_INTELLIGENCE_PIPELINE__.budgetMonitor()` — returns the `UpdateBudgetMonitor` instance.

`window.__LDS_INTELLIGENCE_PIPELINE__.budgetMonitor().setBudget('x-my-tag', { countPerWindow: 3, windowMs: 500 })` — tighten budget for a specific component.

`window.__LDS_INTELLIGENCE_PIPELINE__.budgetMonitor().violationCount()` — total violations emitted this session.

## What it emits
`RuntimeEventType.DIAGNOSTIC` — `EvidenceLevel.CORRELATION` — emitted when an owner's `UPDATE_COMPLETED` count exceeds `countPerWindow` within a rolling `windowMs` window.

Payload: `{ budgetViolation: true, ownerId, tag, updateCount, windowMs, countPerWindow, totalMs }`

Correlation: `{ causedByEventId: <triggering UPDATE_COMPLETED id> }`

## Default budget
`{ countPerWindow: 5, windowMs: 100 }` — fires when a component updates more than 5 times within 100ms.

## Known limits / future work
- Rolling window is event-timestamp based (not wall-clock) — accurate for real apps; clock-controlled in tests.
- A violation emitted once per excess update can be noisy; a future improvement is to debounce and emit one summary DIAGNOSTIC per window.
- Per-tag budgets survive `stop()`/`start()` cycles but are not persisted across page load.
- React/Vue: `UpdateBudgetMonitor` is framework-neutral — subscribes to `UPDATE_COMPLETED` events from any adapter.
