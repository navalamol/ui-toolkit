# Property Watch with Call Stack (Mission 10B)

## Pain solved

Developer needs to know *where* a reactive property is being set — the exact call site, not just
that it changed. Currently: add `console.log` to every possible setter. With this feature: one call
in the browser console tells you every mutation, with file + line.

## Enable

```js
// Intelligence must be enabled first
window.__LDS_INTELLIGENCE_ENABLED__ = true;

// Then watch any reactive property on any Lit component
const unwatch = window.__LDS_WATCH_PROPERTY__('x-checkout', 'loading');

// Stop watching
unwatch();
// or
window.__LDS_UNWATCH_PROPERTY__('x-checkout', 'loading');
```

## What it does

Every time `loading` changes on any `<x-checkout>` element:
1. Emits a `STATE_CHANGED` UREP event with `source.file` + `source.line` from the call stack
2. Tracks mutation frequency — if >threshold mutations in `windowMs`, emits a `DIAGNOSTIC` event
   with `payload.watchAlert: true`

Both events are causal evidence that flows into the Intelligence tab analysis and the evidence capsule.

## Window API (installed by LitIntelligencePipeline when intelligence is enabled)

```js
// Watch a specific property
const unwatch = window.__LDS_WATCH_PROPERTY__(tagName, propName, {
  threshold: 3,    // mutations in windowMs before a DIAGNOSTIC alert fires
  windowMs: 1000,  // rolling window (ms)
});
// unwatch() removes the watch

window.__LDS_UNWATCH_PROPERTY__(tagName, propName);
```

## What it emits

| Event | Level | When |
|---|---|---|
| `STATE_CHANGED` | `ATTRIBUTION` + `SOURCE_ATTRIBUTED` | Every mutation on a watched property (has `payload.watchSource: true`) |
| `DIAGNOSTIC` | `CORRELATION` | When mutation count > threshold in windowMs (has `payload.watchAlert: true`) |

## Intelligence tab

A "Property mutations" section appears at the bottom of the Intelligence tab when:
- At least one watch is active, OR
- At least one `DIAGNOSTIC` watch alert has been emitted this session

Shows: active watch count, total alert count, last alert's source location.

## Known limits / future work

- Watches apply from the point of registration — historical mutations are not replayed
- `watchAll(tagName)` API exists but requires `adapter.getDeclaredProps(el)` to be populated
  (works only for elements that have already connected)
- Call stack skip list hardcodes internal frame paths — may miss frames in heavily-minified builds
- No persistence across page reload (intentional — watches are debugging aids, not always-on)
- React/Vue: same API, different bridge — `ReactPropertyWatchManager` wraps `useState` dispatch;
  `VuePropertyWatchManager` uses Proxy setter trap. UREP emission is identical.
