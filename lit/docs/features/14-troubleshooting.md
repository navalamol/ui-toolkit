# Troubleshooting — common issues

---

## The panel won't open / the 🐞 badge is missing

**Cause:** `<lds-debug-panel>` is not registered, or it's mounted but not visible.

**Check:**
```js
// Is the custom element defined?
customElements.get('lds-debug-panel')   // undefined → element not registered

// Is it in the DOM?
document.querySelector('lds-debug-panel')  // null → not mounted in the app shell
```

**Fix:** Ensure `<lds-debug-panel>` is in your app shell template. It registers itself when the module is imported.

---

## I enabled a flag but the panel tab is empty

**Most common cause:** The flag was set *after* elements mounted. Most tools need to be active during `connectedCallback`.

**Fix:** Set the flag → reload the page.

```js
// Set first:
window.__LDS_PERF_ENABLED__ = true;
// Then reload (Ctrl+R / Cmd+R)
```

**Exception:** These can be toggled live without reload:
- `__LDS_PROP_DEBUG__` (patches on next element connect)
- `__LDS_INSPECTOR__` (toggles the hover badge)
- `__LDS_EVENTS_TRACE__` (records from the moment it's set)

---

## The Perf tab is empty after reload

```js
// Check: are any elements tracked?
Object.keys(window.__LDS_PERF__)
// [] → one of:
//   - LitDebugMixin is not installed on your elements
//   - The flag was set after elements mounted
//   - You're on a page with no tracked elements
```

**Fix checklist:**
1. Is `LitDebugMixin` mixed into your base element class?
2. Did you reload after setting `__LDS_PERF_ENABLED__ = true`?
3. Is there at least one tracked element on this page?

---

## The Resource Tracker shows nothing in Pinpoint

**Most common cause:** You enabled the flag and opened the panel — but never navigated away from the page. Violations only appear at `disconnectedCallback`.

**Required workflow:**
1. Enable: `window.__LDS_RESOURCE_TRACKER__ = true` → reload
2. Navigate to the suspect page (elements mount)
3. Navigate **away** from it (elements disconnect → violations detected)
4. Check console for `[LdsMemory] lifetime-violation:` messages
5. Open panel → Pinpoint → `lifetime-violation` cards

If you see no violations after step 4: the elements on that page are cleaning up correctly — no leak detected.

---

## The Memory tab shows active count > 0 but I don't think there's a leak

Not every non-zero active count is a leak. Common legitimate reasons:

- **The component is a page-level singleton.** `active: 1` for `<nav-header>` is normal — it's supposed to be alive.
- **The page renders many list items.** `active: 48` for `<product-tile>` when there are 48 products in the list is normal.
- **You haven't navigated away yet.** `active` only decrements on `disconnectedCallback`. Components that haven't disconnected yet will always show positive active counts.

**Rule of thumb:** Watch the active count across multiple navigations to the same page and away from it. If it grows monotonically (1, 2, 3... after each visit), it's a leak. If it returns to a stable number after navigating away, it's fine.

---

## Prop Audit logs are flooding the console

`__LDS_PROP_DEBUG__ = '*'` targets all components and is very noisy on complex pages.

**Fix:** Target only the component you're investigating:
```js
window.__LDS_PROP_DEBUG__ = 'rock-grid';  // only this component
```

To turn it off completely:
```js
window.__LDS_PROP_DEBUG__ = false;
```

---

## The Cycle Detector fires but the page doesn't freeze

The cycle detector can report false positives in long sessions. If `window.__LDS_CYCLES__` shows a cycle with `count: 1` from early in the session and the page is running fine, it may be a phantom cycle from accumulated graph edges.

**Check:** Does the cycle fire again when you reproduce the interaction?

```js
window.__LDS_CYCLES__ = [];  // clear the report (does not reset the graph)
// Reproduce the interaction
window.__LDS_CYCLES__        // if still empty → the cycle was a false positive
```

For a clean reset, reload the page with the flag enabled and reproduce immediately.

---

## The Workflow Baseline section shows "No baseline stored"

This is expected on the first visit — no baseline has been set yet.

**To set a baseline:**
1. Go through a representative workflow on the page (load data, interact normally)
2. Open panel → Summary tab → scroll to "Workflow Baseline" section
3. Click **📏 Set as baseline**

The baseline is stored in `localStorage` and persists across sessions.

**If the baseline was set but still shows "No baseline stored":**
- You may be on a different pathname (`/products/123` vs `/products`)
- The key is `__lds_workflow_baseline_${encodeURIComponent(location.pathname)}`
- Verify: `Object.keys(localStorage).filter(k => k.startsWith('__lds_workflow'))`

---

## The Event Tracer shows nothing

**Check 1:** Was the event bus wired?
```js
// The tracer needs patchDispatch() to be called first
LdsEventTracer.patchDispatch(wrap => {
  window.__myBus__.dispatch = wrap(window.__myBus__.dispatch.bind(window.__myBus__));
});
```

**Check 2:** Is the flag on?
```js
window.__LDS_EVENTS_TRACE__ = true;
```

**Check 3:** Are you using native `dispatchEvent()`? The Event Tracer only records dispatches through the patched bus function, not native DOM events.

---

## The panel health score seems wrong

The health score (0–100) in the Summary tab is only as accurate as the tools that are enabled. If no tools are on, the score defaults to 100 (no issues detected). It decrements based on:
- Active Pinpoint findings (by severity and count)
- Vitals results (LCP, long task count)
- Network error count

To get an accurate score: enable the tools relevant to your investigation before opening the panel.

---

## The 📸 Inspector button isn't appearing on hover

**Check 1:** Is the flag set?
```js
window.__LDS_INSPECTOR__  // should be true
```

**Check 2:** Is `LitDebugMixin` on the element you're hovering? The hover listeners are only attached to tracked elements.

**Check 3:** Is the element very small? The button overlay may be clipped or invisible if the element has a very small bounding rect.

**Alternative:** Capture without hovering:
```js
window.createComponentWithData('rock-grid')  // by tag selector
```

---

## The exported JSON is empty or missing sections

Each section of the JSON report only contains data if the corresponding tool was enabled during the session. An empty `perf: {}` in the report means `__LDS_PERF_ENABLED__` was not set before page load.

**To get a full report:**
```js
window.__LDS_DEBUG__ = {
  perf: true, network: true, vitals: true,
  console: true, events: true
};
// Reload, use the app, then Download JSON
```

---

## The Falcor tab shows "No Falcor calls captured yet"

Three possible causes:

**1. `__LDS_NETWORK_ENABLED__` was not set before page load**
```js
window.__LDS_NETWORK_ENABLED__ = true;
// Reload — the XHR patch must be installed before Falcor calls fire
```

**2. FalcorDecoder is not registered**
The Falcor tab only shows calls where `decoded.protocol === 'falcor'`. If `FalcorDecoder` is not registered with `LdsNetwork`, all Falcor calls appear in the Network tab as `xhr` type with no decoded data.

Check:
```js
// Should return N > 0 after navigating to an entity page:
window.__LDS_NETWORK_LOG__.filter(n => n.decoded?.protocol === 'falcor').length

// If 0, check if FalcorDecoder is registered:
// Ensure custom/ui-platform/index.js is imported in your app entry point:
// import 'lit-debug-suite/custom/ui-platform';
```

**3. The page doesn't use Falcor**
Not all pages in the app use Falcor. Config pages, auth pages, and utility pages may use REST endpoints only. Navigate to an entity detail page or search page to trigger Falcor calls.

---

## The Falcor tab shows calls but entityTypes / entityIds / fields are all empty

The path anatomy extraction (`entityTypes`, `entityIds`, `fields`) works by scanning for `byIds` in each path. If the Falcor model for a particular endpoint uses a different path structure without a `byIds` segment, these fields will be empty.

The raw paths are always available — expand any call row → scroll to the "N paths" section to see the full path arrays. Use the console for manual inspection:
```js
window.__LDS_NETWORK_LOG__
  .find(n => n.decoded?.protocol === 'falcor')
  ?.decoded?.paths
// Inspect the structure and see which segment contains entity IDs
```

---

## The Falcor tab shows "parallel" but calls feel sequential

"Parallel" in the burst header means all calls in the burst **started** within 100ms of each other. It does not mean they all finished in parallel — one call may still block UI rendering while its response is processed even if the XHR was sent concurrently.

For true parallelism, check that the burst's `totalMs` ≈ the longest individual call's `durationMs`. If `totalMs` >> longest call, the calls are processing responses sequentially after returning.

---

## The Falcor tab shows duplicate paths but I don't know what to do

A duplicate path means the same Falcor path (the same JSON array) was sent in two separate XHRs. The most common causes:

- **Two components independently requesting the same entity.** Each component calls `FalcorManager.get()` with the same entity ID without knowing the other already requested it. Fix: share the data request through a common service or use a component that already has the data.
- **Navigation pattern.** User navigated away and back — the second visit re-fetched everything. If Falcor's client model is not persisted across navigations, this is expected.
- **Batch splitting.** A large path set was split into multiple XHRs by the batch scheduler. In this case the paths appear in separate calls not by mistake but by design (batch size limit).

Check whether the duplicate paths appear in the same burst (suspect: over-requesting) or in separate bursts (expected: separate user actions).

---

## I don't see the slow-render badge in the Perf tab

The 🔥 badge appears only when there is a matching entry in `__LDS_SLOW_RENDERS__` — which requires a render over **500ms** with a stack trace captured.

If avg ms is 300–499ms: Pinpoint will still show an `observation`-level `slow-render` finding for that component, but without a file/line. Use `__LDS_PROP_DEBUG__` to investigate what's causing the renders.
