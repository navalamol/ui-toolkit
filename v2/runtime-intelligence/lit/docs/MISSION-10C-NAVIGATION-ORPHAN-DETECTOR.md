# Mission 10C — Navigation Events + Component Orphan Detector

**Status:** ✅ Complete — 2026-10-10

## Pain
App grows slower after 10+ minutes of navigation. Heap snapshot grows but the developer can't tell which components are leaking — Lighthouse cannot detect session-length SPA memory leaks at all.

## Existing infrastructure reused
- `RuntimeEventType.NAVIGATION` — already in `evidence-protocol.js`, never emitted before this mission
- `RuntimeEventType.DIAGNOSTIC` — already used by Mission 10B; same pattern
- `EvidenceLevel.CORRELATION` + `AttributionQuality.TEMPORAL_INFERENCE` — correct for time-based orphan detection
- `maskUrlQuery(url)` from `enterprise-privacy.js` — masks query params from navigation URLs before emitting
- `EvidenceStore.snapshot({ type })` — used to find all OWNER_CREATED/OWNER_DESTROYED events for orphan comparison

## What was built

### New: `src/integration/lit/navigation-bridge.js`
Framework-neutral `NavigationBridge` class. Zero imports from any framework adapter.

- Constructor: `{ store, windowTarget, orphanCheckDelayMs=5000 }`
- `start()`: patches `window.history.pushState/replaceState`, adds `popstate` listener
- `stop()`: restores originals, removes listener
- `orphanCount()`: total orphan DIAGNOSTIC events emitted this session

On each navigation event:
1. Emits `NAVIGATION` with `{ url: maskUrlQuery(href), navigationType, timestamp }`
2. Schedules `#checkOrphans(navTimestamp)` after `orphanCheckDelayMs`

Orphan check algorithm:
1. `store.snapshot({ type: OWNER_CREATED })` — all OWNER_CREATED events
2. `store.snapshot({ type: OWNER_DESTROYED })` — all destroyed owner IDs
3. For each created owner with `timestamp <= navTimestamp` not in destroyed set:
   - Increment `#survivedCounts` map for that ownerId
   - Emit `DIAGNOSTIC` with `{ orphanSuspect:true, ownerId, tag, survivedNavigationCount }`
4. Destroyed owners have their survived count reset (clean component)

### Modified: `src/integration/lit/LitIntelligencePipeline.js`
- Import + instantiate `NavigationBridge` as `#navBridge` (when `windowTarget` is provided)
- `start()`: calls `this.#navBridge?.start()`
- `stop()`: calls `this.#navBridge?.stop()`
- Added `navigationBridge()` public accessor

### Modified: `src/integration/lit/panel-intelligence-presentation.js`
- Added `_renderOrphanSection(target)` — reads orphan DIAGNOSTICs from `__LDS_EVIDENCE_STORE__`, deduplicates by ownerId, renders collapsible `<details>` block with per-component survived counts and correlation evidence caveat

### Modified: `src/index.js`
- Added `export { NavigationBridge } from './integration/lit/navigation-bridge.js'`

## Constraints observed
- `NavigationBridge` has zero imports from any framework adapter — framework-neutral per CLAUDE.md
- `NAVIGATION` uses `EvidenceLevel.OBSERVATION` (deterministic browser API)
- `DIAGNOSTIC` orphan uses `EvidenceLevel.CORRELATION` (temporal, not causal proof)
- `maskUrlQuery` called with no policy override — defaults to `ENTERPRISE_SAFE_PRIVACY_POLICY`
- `orphanCheckDelayMs: 0` is the test-safe mode (synchronous check)

## Tests
`test/unit/navigation-bridge.test.mjs` — 8 tests:
1. `pushState` → NAVIGATION event with sanitized URL and timestamp
2. `popstate` → NAVIGATION event
3. `replaceState` → NAVIGATION event
4. Undestroyed component → DIAGNOSTIC with `orphanSuspect:true`
5. Properly disconnected component → no orphan DIAGNOSTIC
6. `survivedNavigationCount` increments across multiple navigations
7. `stop()` removes patches — no further NAVIGATION events
8. Constructor throws on invalid store

## Framework extension path
- **React / Vue**: `NavigationBridge` works identically — history API is browser-level, not framework-specific. React Router / Vue Router both call `history.pushState` internally; this bridge intercepts them automatically.
- Framework adapters (`ReactAdapter`, `VueAdapter`) already emit `OWNER_CREATED`/`OWNER_DESTROYED` — orphan detection requires zero framework-specific changes.
- `ResourceOwnershipLedger` in `src/future/` is fully written and tested — reconnect when `memory.js` emits `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED` for a richer memory-lifetime picture alongside orphan suspects.

## Known improvement areas
- False positives from animated/deferred component cleanup — mitigate with longer `orphanCheckDelayMs` or a second check at 10s
- No cross-navigation orphan aggregation in the panel — currently shows all suspects across all navigations; a future "per-route" view would be more actionable
