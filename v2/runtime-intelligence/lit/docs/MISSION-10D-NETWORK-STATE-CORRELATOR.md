# Mission 10D — Network → State Causal Correlator

**Status:** ✅ Complete — 2026-10-10

## Pain
After an API call, components re-render slowly. The developer cannot attribute the renders to the specific network call. Lighthouse sees the paint spike; it cannot link it to a fetch.

## Existing infrastructure reused
- `RuntimeEventType.NETWORK_COMPLETED` — emitted by `network-evidence-bridge.js` (already wired)
- `RuntimeEventType.DIAGNOSTIC` — already used by 10B and 10C; same pattern
- `EvidenceLevel.CORRELATION` + `AttributionQuality.TEMPORAL_INFERENCE` — correct for time-based inference
- `EvidenceGraph` TRACE_CONTEXT edges — auto-built from `correlation.traceId`; shared traceId → linked events
- `EvidenceGraph` CAUSES edges — auto-built from `correlation.causedByEventId`; used for DIAGNOSTIC → NETWORK_COMPLETED link
- `recordLegacyNetworkEntry` (network-evidence-bridge) — already emits NETWORK_COMPLETED with `path`, `method`, `status`, `durationMs`

## What was built

### New: `src/integration/lit/network-state-correlator.js`
Framework-neutral `NetworkStateCorrelator` class. Zero imports from any framework adapter.

- Constructor: `{ store, correlationWindowMs=500, maxPendingCorrelations=20 }`
- `start()`: subscribes to store
- `stop()`: unsubscribes, clears pending
- `linkCount()`: total DIAGNOSTIC events emitted

Algorithm:
1. On `NETWORK_COMPLETED`: push `{ traceId: 'net-trace-' + id, networkEventId, expiresAt: now + windowMs, path, method }` to pending (max `maxPendingCorrelations` — oldest evicted if full)
2. On every event: prune expired entries
3. On `STATE_CHANGED`: if any non-expired pending correlation exists, emit DIAGNOSTIC for the most recent one with `{ correlation.causedByEventId: networkEventId, correlation.traceId }` and `payload.networkCorrelation: true`

Two state changes from the same network call share the same `traceId` → `EvidenceGraph` creates TRACE_CONTEXT edges between the two DIAGNOSTICs automatically.

### Modified: `src/integration/lit/LitIntelligencePipeline.js`
- Import + instantiate `NetworkStateCorrelator` as `#networkCorrelator`
- `start()`: calls `this.#networkCorrelator?.start()`
- `stop()`: calls `this.#networkCorrelator?.stop()`
- Added `networkCorrelator()` public accessor

### Modified: `src/integration/lit/panel-intelligence-presentation.js`
- Added `_renderNetworkCorrelationSection(target)` — reads DIAGNOSTICs with `networkCorrelation:true` from `__LDS_EVIDENCE_STORE__`, groups by traceId, renders collapsible `<details>` block: "METHOD /path → N state changes within Xms"

### Modified: `src/index.js`
- Added `export { NetworkStateCorrelator } from './integration/lit/network-state-correlator.js'`

## Constraints observed
- `NetworkStateCorrelator` has zero imports from any framework adapter — framework-neutral
- `DIAGNOSTIC` uses `EvidenceLevel.CORRELATION` (temporal, not causal proof)
- TRACE_CONTEXT edges require ≥ 2 events sharing the same `traceId` — satisfied when a single network call triggers multiple state changes
- CAUSES edge from DIAGNOSTIC → NETWORK_COMPLETED always present via `causedByEventId`

## Tests
`test/unit/network-state-correlator.test.mjs` — 8 tests:
1. STATE_CHANGED within window → DIAGNOSTIC with networkCorrelation, method, path, tracedMs
2. STATE_CHANGED after window expiry → no DIAGNOSTIC (clock-controlled)
3. Multiple network calls → links to most recent non-expired
4. Two state changes from same call → shared traceId → EvidenceGraph TRACE_CONTEXT edge
5. Bounded pending (maxPendingCorrelations=3): 4th network call drops oldest
6. `linkCount()` increments per emitted DIAGNOSTIC
7. `stop()` unsubscribes — no further DIAGNOSTICs
8. Constructor throws on invalid store

## Framework extension path
- **React / Vue**: `NetworkStateCorrelator` subscribes to the store — framework-neutral. Works identically as long as the adapter emits `STATE_CHANGED` and the network bridge emits `NETWORK_COMPLETED`.
- ReactAdapter and VueAdapter emit `STATE_CHANGED` from `useState`/`reactive` setters; no changes needed to the correlator.

## Known improvement areas
- Score multiple candidate network calls by proximity (not just most-recent) — future improvement
- `correlationWindowMs` could be a window global (`__LDS_NETWORK_CORRELATION_WINDOW_MS__`) — defer until needed
- Per-request correlation (using `fetch`'s requestId if available) would upgrade from CORRELATION to ATTRIBUTION evidence
