# Mission 10B — Property Watch with Call Stack

Status: COMPLETE

## Pain

Developer cannot find where a reactive property is being mutated. They add `console.log`
everywhere, rebuilds, searches. This tool exposes every mutation site with a call stack.

## Existing infrastructure reused

- `LitAdapter.hookRequestUpdate(el, fn)` — per-instance requestUpdate intercept
- `parseRuntimeSourceLocation(line)` — `src/core/source-resolver.js`
- `EvidenceLevel`, `AttributionQuality` — `src/core/evidence-protocol.js`
- `RuntimeEventType.STATE_CHANGED`, `RuntimeEventType.DIAGNOSTIC`
- `LitAdapter.ownerOf(el)` — owner lookup
- `_toolEnabled('intelligence')` — `src/core/gate.js`

## What was built

### New: `src/adapter/lit/LitAdapter.js`

Added `#stateChangeInterceptors = []` private field.
Added `addStateChangeInterceptor(fn)` method — returns an unsubscribe function.
In `recordUpdateRequested()`: calls each interceptor with `(el, name, oldValue)` before emitting
STATE_CHANGED. Interceptor errors are swallowed (never break app).

### New: `src/integration/lit/property-watch-manager.js`

`PropertyWatchManager` class:
- `constructor({ adapter, store })`
- `start()` / `stop()` — install/remove the state change interceptor on the adapter
- `watch(tagName, propName, { threshold, windowMs })` → returns `unwatch()` fn
- `unwatch(tagName, propName)` — removes watch from registry
- `activeWatches()` — returns array of `{ tagName, propName }` for panel display
- `alertCount()` — count of DIAGNOSTIC watchAlert events emitted this session

Interceptor fires on every `requestUpdate`. Fast path: if no watches registered, returns
immediately. When a watched property fires: captures `new Error().stack`, skips internal frames
via `parseRuntimeSourceLocation`, emits `STATE_CHANGED` with source. Tracks rolling mutation count;
emits `DIAGNOSTIC` with `watchAlert: true` when threshold exceeded.

### Modified: `src/integration/lit/LitIntelligencePipeline.js`

- Added `#watchManager` private field
- Constructor creates `PropertyWatchManager({ adapter: litAdapter, store })`
- `start()`: calls `watchManager.start()`, installs `window.__LDS_WATCH_PROPERTY__` and
  `window.__LDS_UNWATCH_PROPERTY__` globals when `_toolEnabled('intelligence')`
- `stop()`: calls `watchManager.stop()`
- Added `watchManager()` public method — exposes the manager for tests and direct use

### Modified: `src/integration/lit/panel-intelligence-presentation.js`

Added `_renderWatchSection(target)` — renders "Property mutations" section when watches are
active or alerts have fired. Shows: active watch count, alert count, last alert source.

## Constraints enforced

- `payload.watchSource: true` on all watch-emitted STATE_CHANGED (semantic distinction)
- `payload.watchAlert: true` on DIAGNOSTIC threshold events
- Instance patching only — no prototype patching
- Interceptor errors are silently swallowed
- Fast path when no watches registered (zero overhead at idle)
- Privacy: call stack frames sanitized via `parseRuntimeSourceLocation` + `sanitizeSourceFile`

## Tests

`test/unit/property-watch-manager.test.mjs` — 5 tests:
1. Watch fires STATE_CHANGED with `source.file` populated
2. Mutation below threshold → no DIAGNOSTIC
3. Mutation above threshold in window → DIAGNOSTIC with `watchAlert: true`
4. `unwatch()` removes hook — no further watch events
5. `payload.watchSource === true` distinguishes from normal LitAdapter STATE_CHANGED

## Framework extension path

React: `ReactPropertyWatchManager` wraps `useState`/`useReducer` dispatch intercept in
`ReactAdapter`. Same UREP emission (STATE_CHANGED + DIAGNOSTIC). Zero changes to core.
Vue: Proxy setter trap on `reactive()`/`ref()` objects. Same emission pattern.
`PropertyWatchManager` is Lit-specific; the window API contract and UREP events are universal.

## Known limits / future improvements

- Historical mutations not replayed (watches are point-in-time)
- `watchAll(tagName)` needs `getDeclaredProps(el)` populated at connect time
- Call stack skip list is path-string-based — improve with regex patterns in future
- No watch persistence across reload (intentional — not always-on monitoring)
