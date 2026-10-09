# Network → State Correlator (20)

## Pain solved
After an API call, 6 components re-render slowly. The developer cannot attribute the slow renders to the network call. Lighthouse sees the paint spike but cannot attribute it to a specific fetch.

## Enable
Starts automatically with `LitIntelligencePipeline.start()`. No additional flag required. The correlation section appears in the Intelligence tab when network→state links are found.

## Window API
`window.__LDS_INTELLIGENCE_PIPELINE__.networkCorrelator()` — returns the `NetworkStateCorrelator` instance.

`window.__LDS_INTELLIGENCE_PIPELINE__.networkCorrelator().linkCount()` — total correlations emitted.

`window.__LDS_NETWORK_CORRELATION_WINDOW_MS__ = 500` — override correlation window (milliseconds).

## What it emits
`RuntimeEventType.DIAGNOSTIC` — `EvidenceLevel.CORRELATION` — emitted for each STATE_CHANGED event that arrives within `correlationWindowMs` of a NETWORK_COMPLETED event.

Payload: `{ networkCorrelation: true, networkEventId, stateEventId, stateOwnerId, stateOwnerTag, stateProperty, networkPath, networkMethod, tracedMs, traceId }`

Correlation: `{ causedByEventId: networkEventId, traceId: 'net-trace-<id>' }`

Multiple state changes from the same network call share the same `traceId` → `EvidenceGraph` builds TRACE_CONTEXT edges between them automatically.

## How it works
1. Subscribes to the EvidenceStore.
2. On `NETWORK_COMPLETED`: records a pending correlation entry `{ traceId, expiresAt, path, method }`. Bounded to `maxPendingCorrelations` (default 20) — oldest dropped when exceeded.
3. On `STATE_CHANGED`: if any pending correlation is non-expired, emits a DIAGNOSTIC for the most recent one.
4. Expired entries are pruned on each event.

## Known limits / future work
- Evidence is CORRELATION (temporal), not ATTRIBUTION — the network call may be coincidental. Confirm by checking component source in Pinpoint tab.
- One-to-one match (each STATE_CHANGED links to the most recent network call) — a future improvement could score multiple candidates by proximity.
- The `correlationWindowMs` default (500ms) may need tuning per-app; expose as a constructor option and/or `window.__LDS_NETWORK_CORRELATION_WINDOW_MS__` override.
