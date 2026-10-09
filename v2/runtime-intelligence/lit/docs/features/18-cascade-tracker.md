# Reactive Cascade Tracker (18)

## Pain solved
Developer clicks one button and 20 components re-render — they have no idea which ones or why. This feature makes the full fan-out graph visible with causal edges in the Intelligence tab.

## Enable
Intelligence tab is always active when `window.__LDS_INTELLIGENCE_ENABLED__ = true` (or `window.__LDS_DEBUG__ = { intelligence: true }`). Cascade detection is on by default; it requires no extra flag.

## Window API
`window.__LDS_CASCADE_REPORT__` — latest `CascadeReport | null` written by the pipeline after each incident analysis.

`window.__LDS_INTELLIGENCE_PIPELINE__.cascadeReport()` — same value via method.

## What it emits
`RuntimeEventType.DEPENDENCY_TRIGGERED` — `EvidenceLevel.ATTRIBUTION` — emitted by `LitAdapter.recordUpdateRequested()` when another element is mid-render (top of `_renderStacks`) and the requestUpdate was for a *different* element, indicating a reactive cascade fan-out.

## CascadeReport shape
```js
{
  hasCascade: true,
  rootEventId: string | null,       // originating STATE_CHANGED/INTERACTION
  triggerCount: number,             // total DEPENDENCY_TRIGGERED events
  componentCount: number,           // distinct owner count
  depth: number,                    // max chain depth
  totalUpdateMs: number,            // sum of cascaded UPDATE_COMPLETED durations
  branches: [{ ownerId, tag, triggerCount, depth }],
  overReactingOwners: [{ ownerId, tag, triggerCount }],  // triggered > threshold (default 3)
}
```

## Known limits / future work
- Cascade detection relies on Lit's synchronous `requestUpdate` being called while a parent is mid-`performUpdate`. Async deferred updates (setTimeout/microtask chains) appear as separate incidents, not as a cascade — no false positives.
- ReactAdapter emits `DEPENDENCY_TRIGGERED` from Profiler `onRender` commit data; `CascadeAnalyzer` will process those identically with zero changes.
- `overReactingThreshold` is currently hardcoded to 3; expose as `CascadeAnalyzer` constructor option when per-project tuning is requested.
- Panel shows latest cascade only; historical cascade timeline is accessible via `exportCapsule()`.
