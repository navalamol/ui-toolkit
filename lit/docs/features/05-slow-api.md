# Slow API Monitor — `__LDS_SLOW_API__`

**Source:** `src/core/slow-api.js`  
**Panel tab:** SlowAPI  
**Data globals:** `window.__LDS_SLOW_API_LOG__`

---

## What it is

Wraps the methods of any API object to detect slow calls. When a wrapped method takes longer than the configured threshold to resolve, it:
1. Logs to `window.__LDS_SLOW_API_LOG__`
2. Emits a `console.warn`
3. Shows a visual orange badge overlay on the component that triggered the call

This is generic — it works with any JavaScript object that has async methods. The Syndigo integration wraps `DataObjectManager` (via `custom/ui-platform/SyndigoSlowApiPlugin.js`).

---

## The problem it solves

A component feels slow after the initial render. You can rule out render time (Perf tab shows it's fast). The delay must be in a data fetch. You don't know which API method was called, from which component, with what request parameters, or how long it actually took.

Without tooling: add timing logs around every API call, rebuild, reload, reproduce. Or: open the Network tab and try to correlate XHR timing with component renders (difficult when many components fire requests simultaneously).

With this tool: the badge appears directly on the slow component (`⏱ 823ms`), and clicking it shows the method name, request payload, and response.

---

## How to enable

```js
// Enable detection
window.__LDS_SLOW_API__ = true;

// Threshold (default: 2000ms)
window.__LDS_SLOW_API_MS__ = 1000;   // flag anything over 1 second

// Silent mode — log only, no visual badge
window.__LDS_SLOW_API_SILENT__ = true;
```

### Wiring your API object (one-time setup)

```js
// Wrap specific methods on any API object
LdsSlowApiMonitor.wrapObject(myApiClient, ['get', 'post', 'query', 'fetch']);

// Or wrap a singleton after it loads
LdsSlowApiMonitor.wrapObject(window.__dataManager__, ['get', 'find', 'list']);
```

The wrapper uses `orig.__ldsSlowApiWrapped` to prevent double-wrapping. Safe to call repeatedly.

---

## How it works

`wrapObject(obj, methods)` replaces each named method on `obj` with a wrapper that:

1. Reads `_activeEl` (the component currently in its `connectedCallback` microtask) to attribute the call to a component.
2. Calls the original method and captures the return value.
3. If the return value is a Promise (`.then` exists), attaches a `.then` handler that measures `performance.now() - t0`.
4. If `ms >= threshold`, creates a log entry and optionally shows the badge on the attributed element.

**Component attribution:** `attach(el)` sets `_activeEl = el` during `connectedCallback` and clears it via `Promise.resolve().then(...)` (one microtask after). Any API call made synchronously in `connectedCallback` is attributed to the connecting element. Async calls (from `updated()`, event handlers) have `_activeEl = null` and are attributed as `tag: null`.

The badge is injected into the element's shadow root (or light DOM) and auto-removes after 8 seconds. It uses `position: absolute` on the element, setting `position: relative` if needed.

---

## The data shape

```js
window.__LDS_SLOW_API_LOG__
// [{ ts, ms, method, tag, operation, request, response, status }]

window.__LDS_SLOW_API_LOG__[0]
// {
//   ts:        "10:14:32.110",
//   ms:        1823,
//   method:    "get",
//   tag:       "rock-grid",         // attributed component (null if unattributed)
//   operation: "product/filters",   // heuristic from request shape
//   request:   { ... },             // first argument to the method
//   response:  { ... },             // resolved value
//   status:    200
// }
```

**Operation extraction:** `_extractOperation(args)` tries to derive a readable label from the request shape:
- String argument: last two path segments (e.g. `products/list`)
- Object with `entity.type`: the entity type string
- Object with `params.query.filters.typesCriteria`: joined criteria
- Object with `url`: last path segment of URL
- Fallback: `"unknown"`

---

## Console commands

```js
// Print slow calls as console.table
window.__LDS_SLOW_API_REPORT__()

// Full log for scripting
window.__LDS_SLOW_API_LOG__
```

---

## Reliability

**High:** Timing is real — `performance.now()` delta from call to Promise resolution. If the log says 823ms, the call took 823ms.

**Medium:** `tag` attribution is accurate only for API calls made synchronously during `connectedCallback`. Calls from `updated()`, `firstUpdated()`, or event handlers have `tag: null` because the attribution microtask has already cleared by then.

**Known edge:** The badge requires `position: relative` on the element to position correctly. For elements with `position: fixed` or `position: absolute` (e.g., overlays), badge positioning may be wrong. `__LDS_SLOW_API_SILENT__ = true` works around this by suppressing the badge entirely.

---

## Limitations

**Sync methods are not tracked.** Only methods that return a Promise are measured. Synchronous API calls (rare in modern apps but not impossible) appear to complete in 0ms.

**One active element at a time.** `_activeEl` is a module-level variable. If two elements are mounting simultaneously (rare but possible during server-side hydration or concurrent rendering), attribution may go to the wrong element or be cleared before the API call.

**`wrapObject` targets one object.** If your app has multiple API client instances (e.g., one per domain), each needs its own `wrapObject` call.

**Badge appears only if the element is in the DOM.** If the API call happens but the element unmounts before the Promise resolves, `capturedEl` may be disconnected. The badge append fails silently.

**No retries or aggregation.** Each slow call is a separate log entry. If the same method is called and is slow 10 times, there are 10 entries. There's no aggregation by method name or component.

---

## What can improve

1. **Attribution beyond connectedCallback.** Track API calls from `updated()` and event handlers by exposing `el.__ldsSetApiContext()` for manual call-site annotation.
2. **Aggregation by method + component.** Group log entries to show `rock-grid.get("product/filters"): 3 calls, avg 1200ms` instead of 3 separate entries.
3. **Threshold per method.** Some API methods are inherently slower than others. A per-method threshold map (`{ get: 1000, list: 3000 }`) would reduce false positives.
4. **Badge click → Pinpoint focus.** Clicking the orange badge should open the panel to the SlowAPI tab filtered to that call.
5. **Log entries for non-slow calls too.** Currently only slow calls are logged. An opt-in to log all calls would help understand total API call volume.

---

## How it makes life easier

- **Visual attribution.** The badge appears directly on the component that triggered the slow call — no need to correlate Network tab entries with component renders manually.
- **Request + response in one place.** Click the badge → see method name, request payload, response, in a console group. Everything needed to file a bug or ask for a fix.
- **No rebuild.** The wrapper is applied at runtime, on the live singleton.
- **Silent mode for CI/logging environments.** `__LDS_SLOW_API_SILENT__ = true` gives you the log without visual mutation — safe to enable in staging environments where visual badges would look like bugs.

---

## Complete example

```js
// 1. Wire the API object (in app init or devtools)
LdsSlowApiMonitor.wrapObject(window.__dataObjectManager__, ['get', 'findAll', 'query']);

// 2. Enable with a tight threshold
window.__LDS_SLOW_API__ = true;
window.__LDS_SLOW_API_MS__ = 800;

// 3. Navigate to a page and watch for badges
// → ⏱ 1823ms badge appears on <rock-grid>

// 4. Click the badge in devtools console output:
// [LdsSlowApi] rock-grid — 1823ms — product/filters
//   Method: get
//   Request: { entity: { type: "product" }, params: { query: { filters: { ... } } } }
//   Response: { data: [...48 items], totalCount: 248 }

// 5. Check the full log
window.__LDS_SLOW_API_REPORT__()
// ┌──────────────┬───────┬────────┬───────────┬──────────────────┐
// │ ts           │ ms    │ method │ component │ operation        │
// ├──────────────┼───────┼────────┼───────────┼──────────────────┤
// │ 10:14:32.110 │ 1823  │ get    │ rock-grid │ product/filters  │
// └──────────────┴───────┴────────┴───────────┴──────────────────┘
```
