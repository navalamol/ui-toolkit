# Navigation + Orphan Detector (19)

## Pain solved
App grows slower after 10 minutes of navigation. Heap snapshot grows but the developer can't tell which components are leaking. This feature surfaces components that survive route changes without being disconnected — the most common class of SPA memory leak.

## Enable
Navigation tracking starts automatically with `LitIntelligencePipeline.start()` when a `windowTarget` is available. No additional flag required. The orphan section appears in the Intelligence tab when suspects are detected.

## Window API
Navigation events are browser-level — no window API needed to trigger them.

`window.__LDS_INTELLIGENCE_PIPELINE__.navigationBridge()` — returns the `NavigationBridge` instance.

`window.__LDS_INTELLIGENCE_PIPELINE__.navigationBridge().orphanCount()` — total orphan DIAGNOSTIC events emitted this session.

## What it emits

`RuntimeEventType.NAVIGATION` — `EvidenceLevel.OBSERVATION` — on every `pushState`, `replaceState`, and `popstate` event.

Payload: `{ url, navigationType, timestamp }`

`RuntimeEventType.DIAGNOSTIC` — `EvidenceLevel.CORRELATION` — emitted for each owner that was alive before a navigation and was never OWNER_DESTROYED within `orphanCheckDelayMs` (default 5000ms).

Payload: `{ orphanSuspect: true, ownerId, tag, survivedNavigationCount }`

## Known limits / future work
- Evidence level is CORRELATION (temporal, not causal) — a component that defers disconnection via animation/transition could appear as a false positive. Confirm with DevTools Memory heap snapshot.
- `orphanCheckDelayMs` defaults to 5000ms to allow async cleanup (transitions, deferred lifecycle). Expose as a constructor option if applications need tuning.
- React/Vue: navigation events are browser-level (history API), so `NavigationBridge` works identically without changes. Framework adapters emit `OWNER_CREATED`/`OWNER_DESTROYED` — orphan detection is framework-neutral.
- `ResourceOwnershipLedger` in `src/future/` is fully written — wire when `memory.js` emits `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED` for a deeper memory-leak picture.
