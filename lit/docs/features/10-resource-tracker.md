# Resource Tracker — `__LDS_RESOURCE_TRACKER__`

**Source:** `src/core/memory.js` (Phase 9)  
**Panel tab:** None dedicated — findings appear in Pinpoint  
**Data globals:** `window.__LDS_RESOURCE_VIOLATIONS__`, `window.__LDS_RESOURCE_VIOLATIONS_RESET__()`

> **No panel tab.** Resource Tracker findings appear in the **Pinpoint tab** as `lifetime-violation` cards.
>
> **Critical workflow note:** Violations are only detected when an element **disconnects** (`disconnectedCallback`). You must navigate *away* from the page (or close a modal/dialog) to trigger detection. Opening the panel immediately after enabling the flag and seeing nothing does not mean there are no leaks — it means the elements haven't disconnected yet.

---

## What it is

Tracks individual `addEventListener` calls and detects which ones survive past `disconnectedCallback`. Any event listener that was registered by an element but not removed before the element disconnects is a **lifetime violation** — a deterministic leak.

This catches the single most common class of memory leak in LitElement apps: forgetting to call `removeEventListener` in `disconnectedCallback` for listeners added in `connectedCallback`.

---

## The problem it solves

You have a component that adds `window.addEventListener('resize', this._onResize)` in `connectedCallback`. You forget to remove it in `disconnectedCallback`. Every time the user navigates to that page, a new listener accumulates. After 10 navigations: 10 `resize` listeners on `window`, all firing, all holding references to the component instance.

You can check this in DevTools → Event Listeners panel, but it requires manually expanding the right element/window and knowing what you're looking for. For global listeners (`window`, `document`), there's no visual indicator at all.

The Resource Tracker finds these automatically and tells you which component, which event type, and which target owns the orphaned listener.

---

## How to enable

The resource tracker is **off by default**. It patches `addEventListener` globally, which has measurable overhead. Enable only when investigating listener leaks.

```js
// Enable
window.__LDS_RESOURCE_TRACKER__ = true;

// Optional: customise the suppressed event types
// Default suppressed: mousemove, pointermove, touchmove, scroll, wheel, mouseenter, mouseleave
window.__LDS_SUPPRESS_EVENTS__ = ['mousemove', 'pointermove', 'scroll'];  // replace defaults
window.__LDS_SUPPRESS_EVENTS__ = [];  // track everything (very noisy)
```

Set `__LDS_SUPPRESS_EVENTS__` before elements mount for it to take effect. The flag can be set before or after `__LDS_RESOURCE_TRACKER__`.

---

## How it works

When an element mounts (`connectedCallback`) with the resource tracker active, `attach(el)` does two things:

**1. Sets `_currentOwner = el`**

This marks the currently connecting element as the "active owner" for the duration of `connectedCallback`. After one microtask (`queueMicrotask(() => { if (_currentOwner === el) _currentOwner = null; })`), ownership is cleared. This window is exactly the synchronous portion of `connectedCallback`.

**2. Patches per-element `addEventListener`/`removeEventListener`**

`el.addEventListener` is replaced with a wrapper that calls `_registerListener(el, type, 'self', fn, stack)` before delegating to the original.

**Global listener attribution (one-time patch)**

On first use, `window.addEventListener` and `document.addEventListener` are also patched. Any call to these made while `_currentOwner !== null` is attributed to the current owner:

```js
window.addEventListener('resize', this._onResize);  // ← attributed to the connecting element
```

**On disconnect**, `detach(el)` iterates the ledger for that element instance. Any listener registered but not yet removed is a violation. It's pushed to `window.__LDS_RESOURCE_VIOLATIONS__` and a `console.warn` is emitted.

```
[LdsMemory] lifetime-violation: <rock-grid> (instance #3) disconnected with 3 unreleased resource(s)
  resize on window
  click on self
Details: window.__LDS_RESOURCE_VIOLATIONS__
```

---

## The data shape

```js
// Violations log
window.__LDS_RESOURCE_VIOLATIONS__
// [{ ownerId, ownerTag, instanceNum, resources[], detectedAt }]

window.__LDS_RESOURCE_VIOLATIONS__[0]
// {
//   ownerId:     3,
//   ownerTag:    "rock-grid",
//   instanceNum: 3,
//   resources: [
//     { id: "rl7", type: "resize", target: "window",   fn: [Function], registeredAt: "...", stack: "..." },
//     { id: "rl8", type: "click",  target: "self",     fn: [Function], registeredAt: "...", stack: "..." }
//   ],
//   detectedAt:  "2026-10-06T10:14:32.110Z"
// }
```

---

## Console commands

```js
// See all violations
window.__LDS_RESOURCE_VIOLATIONS__

// Clear violations and the internal tracking ledger
window.__LDS_RESOURCE_VIOLATIONS_RESET__()
```

---

## Pinpoint integration

Violations feed a Pinpoint finding:

| Condition | Finding type | Evidence level |
|-----------|-------------|----------------|
| Violation detected | `resource-outlived-owner` | `lifetime-violation` |

Evidence level is always `lifetime-violation` — it is deterministic. There is no heuristic involved: if a violation is recorded, the listener genuinely survived the element's disconnect.

The Fix Table export for this finding:
```js
evidenceCapsule: {
  problem:       "resource-outlived-owner",
  evidenceLevel: "lifetime-violation",
  observed: {
    violationCount: 1,
    resourceCount:  2,
    eventTypes:     ["resize", "click"]
  },
  recommendation: "Add removeEventListener in disconnectedCallback for: resize (on window), click (on self)",
  claudePrompt:   "Fix a HIGH resource-outlived-owner issue in <rock-grid>..."
}
```

---

## Default suppressed events

The following event types are suppressed by default and will not be tracked even when the flag is on. These are commonly registered globally and are not typically leaks:

`mousemove`, `pointermove`, `touchmove`, `scroll`, `wheel`, `mouseenter`, `mouseleave`

Override with `window.__LDS_SUPPRESS_EVENTS__ = [...]` (replaces the entire list).

---

## Reliability

**Very high.** Lifetime violations are deterministic. The ledger tracks listener function references via a `WeakMap`. If `removeEventListener` is called with the matching function reference, the ledger entry is removed. If `disconnectedCallback` runs and the entry is still in the ledger, the listener was never removed.

**Known constraints:**

Async registrations are not tracked:
```js
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('resize', this._onResize);  // ← tracked

  setTimeout(() => {
    window.addEventListener('keydown', this._onKey);  // ← NOT tracked (runs after ownership clears)
  }, 0);
}
```

Arrow functions create non-removable registrations:
```js
// This registers a new function reference each time
this.addEventListener('click', (e) => this._handleClick(e));
// removeEventListener('click', (e) => ...) will never match
// The tracker records this as a violation — but it IS a violation; the function is stuck forever
```

---

## Limitations

**Async registrations not attributed.** Listeners added in `updated()`, `firstUpdated()`, `setTimeout`, or Promise callbacks are not attributed to an element because `_currentOwner` is null by then. They are not reported as violations even if they leak.

**Same function reference tracks once.** If you pass the same `fn` to `addEventListener` on two different targets, only the first registration is tracked in the `WeakMap` (keyed by `fn`). The second registration is effectively invisible to the tracker.

**Shared listeners from singletons.** If a singleton service calls `window.addEventListener` from inside an element's `connectedCallback` (indirectly), the listener is attributed to the element, even though the singleton "owns" it. Use `__LDS_SUPPRESS_EVENTS__` to exclude the event type, or refactor the service to register outside the lifecycle hook.

**Overhead.** Patching `window.addEventListener` and `document.addEventListener` globally is measurable overhead on event-heavy pages. This is why the tool is off by default. Disable after investigating.

---

## What can improve

1. **Async registration tracking.** Allow elements to manually enter ownership for async registrations:
   ```js
   el.__ldsSetApiContext();
   await someAsyncSetup();
   window.addEventListener('resize', this._onResize);
   el.__ldsClearApiContext();
   ```
   (`el.__ldsSetApiContext` is already attached by SlowApiMonitor — a similar pattern could work here.)

2. **Violation grouping by instance.** Currently each element instance produces its own violation entry. Group by `(ownerTag, eventTypes)` to show "3 instances of rock-grid all leaked resize" as one finding with a count.

3. **Stack trace display in Pinpoint.** The `stack` on each resource entry shows where `addEventListener` was called. This is currently not surfaced in the panel — only in `window.__LDS_RESOURCE_VIOLATIONS__[n].resources[m].stack`.

4. **Auto-suggest fix.** Given the known call site and event type, auto-generate the `disconnectedCallback` fix:
   ```js
   // Detected: window.addEventListener('resize', this._onResize) at rock-grid.js:92
   // Suggestion: add to disconnectedCallback:
   window.removeEventListener('resize', this._onResize);
   ```

---

## How it makes life easier

- **Deterministic leak detection.** No guessing, no sampling. A violation means a listener is definitely leaking.
- **Finds what DevTools can't easily show.** Global listeners on `window`/`document` are invisible in the Elements panel's Event Listeners tree. The Resource Tracker surfaces them with component attribution.
- **Evidence level `lifetime-violation` = always fix.** No need to investigate further or gather more evidence. When you see this in Pinpoint, the recommendation is the fix.
- **Export includes the violation.** Fix Table export carries the event types and target for each violation, so Claude Code gets the exact removeEventListener calls to add.

---

## What you'll see

**In the browser console** — when elements disconnect with unreleased listeners:

```
[LdsMemory] lifetime-violation: <rock-grid> (instance #3) disconnected with 2 unreleased resource(s)
  resize on window
  click on self
Details: window.__LDS_RESOURCE_VIOLATIONS__
```

**In the Pinpoint tab** — a `lifetime-violation` card (red — highest confidence):

```
[HIGH] resource-outlived-owner                     lifetime-violation
rock-grid (instance #3)
2 unreleased listeners: resize (window), click (self)
→ "Add removeEventListener in disconnectedCallback for: resize (on window), click (on self)"
```

- Evidence level `lifetime-violation` is always red — this is a definite leak, not a hypothesis
- The recommendation already contains the exact fix — add `removeEventListener` in `disconnectedCallback`
- The fix is deterministic: the recommendation names the event type and target exactly

---

## Reading the results

| What you see | What it means |
|---|---|
| `target: "window"` | Most dangerous — a global listener accumulates on every navigation |
| `target: "document"` | Same concern as window |
| `target: "self"` | Lower urgency — element will be GC'd eventually, but still a clean-code issue |
| Multiple violations for the same component tag | Same pattern repeating across instances — one fix covers all |
| No violations but you expect leaks | Either there are no leaks (good!), or you haven't navigated away yet (trigger disconnect first) |

---

## Step-by-step: I suspect event listeners are leaking

1. `window.__LDS_RESOURCE_TRACKER__ = true` → **reload** (must be set before elements mount)
2. Navigate to the suspect page — elements mount and listeners are registered
3. **Navigate away** from the page (or close the modal/dialog) — this triggers `disconnectedCallback`
4. Check the browser console for `[LdsMemory] lifetime-violation:` messages
5. Open panel → **Pinpoint tab** → look for red `lifetime-violation` cards
6. For each violation: the recommendation tells you exactly which `removeEventListener` to add
7. To see the call site: `window.__LDS_RESOURCE_VIOLATIONS__[0].resources[0].stack` — shows where `addEventListener` was called
8. Apply the fix → reload → repeat steps 2–4 → `window.__LDS_RESOURCE_VIOLATIONS__.length === 0` confirms it's fixed

---

## Sanity check

```js
// Confirm the tracker is running:
Array.isArray(window.__LDS_RESOURCE_VIOLATIONS__)  // true → tracker active
// undefined → flag was set after elements mounted → reload

// Check for any violations:
window.__LDS_RESOURCE_VIOLATIONS__.length
// 0 after navigating away = no leaks detected (or tool not yet triggered)

// See violation details:
window.__LDS_RESOURCE_VIOLATIONS__[0]?.resources?.map(r => `${r.type} on ${r.target}`)
```

---

## Complete example

```js
// 1. Enable before the component mounts
window.__LDS_RESOURCE_TRACKER__ = true;

// 2. Navigate to the page → rock-grid mounts → navigate away → rock-grid disconnects
// Console: [LdsMemory] lifetime-violation: <rock-grid> (instance #1) disconnected with 1 unreleased resource(s)
//            resize on window

// 3. Inspect the violation
window.__LDS_RESOURCE_VIOLATIONS__[0].resources[0].stack
// → "...at rock-grid.js:184 (inside connectedCallback)..."

// 4. Export Fix Table → evidenceCapsule.recommendation:
// "Add removeEventListener in disconnectedCallback for: resize (on window)"

// 5. Fix in rock-grid.js:
disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('resize', this._onResize); // ← add this
}

// 6. Verify: reload, navigate to/from page, check:
window.__LDS_RESOURCE_VIOLATIONS__.length === 0   // ✓
```
