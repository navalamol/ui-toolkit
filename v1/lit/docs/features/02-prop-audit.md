# Prop Audit — `__LDS_PROP_DEBUG__`

**Source:** `src/core/prop-audit.js`  
**Panel tab:** None dedicated — output goes to browser console + Pinpoint tab  
**Data globals:** `window.__LDS_RENDER_REASONS__`, `window.__LDS_THRASH__`

> **No panel tab.** Prop Audit has no dedicated tab. Results appear in two places: (1) the **browser console** as grouped logs while you interact with the target component, and (2) the **Pinpoint tab** if thrash is detected. Keep DevTools console open alongside the panel to use this tool effectively.

---

## What it is

Two tools in one flag:

- **R2-A — Render reason tracker:** logs which property changed, what the old and new values were, and a stack trace, every time a component updates.
- **R2-B — Property thrash detector:** fires when a property is set more than N times per second on the same element, indicating it's being written from multiple places unnecessarily.

---

## The problem it solves

You have a component that re-renders more than expected. In React DevTools you'd see "why did this render." Lit has no built-in equivalent. The standard approach is to add `console.log` to `updated()` and rebuild.

For thrash: a prop is being set inside a loop, from an event handler and from a data change simultaneously, or from multiple parent elements. You see rendering jank but can't tell what's causing the churn without stepping through the debugger.

---

## How to enable

```js
// Target a specific component only (recommended to start)
window.__LDS_PROP_DEBUG__ = 'rock-grid';

// Watch all components — very noisy on complex pages
window.__LDS_PROP_DEBUG__ = '*';

// Turn off
window.__LDS_PROP_DEBUG__ = false;

// Configure thrash sensitivity (default: 5 writes per 1000ms triggers a report)
window.__LDS_THRASH_THRESHOLD__ = 3;   // stricter
window.__LDS_THRASH_THRESHOLD__ = 10;  // more lenient
```

Can be set and changed at any time without reload. The patch is applied per-element on the next `connectedCallback`.

---

## How it works

`attach(el)` patches two Lit methods on the element instance directly (not the prototype):

**R2-A — hooks `el.requestUpdate(name, oldValue)`**

Every time Lit queues a property change, the wrapped version records:
```js
{ prop, oldSummary, newSummary, sameRef, ts }
```
`sameRef: true` means you passed the same object reference as the new value — Lit sees it as a change because you triggered `requestUpdate` explicitly, but the object content didn't change. This is a common source of unnecessary renders when using mutable arrays/objects.

**R2-B — also in the `requestUpdate` hook**

Every write is timestamped in a per-element, per-prop sliding window (1000ms). If writes exceed `__LDS_THRASH_THRESHOLD__` (default: 5) within that window, a thrash entry is pushed to `window.__LDS_THRASH__`. Deduplication: the same prop on the same element only reports once per 3-second bucket, so a continuously thrashing prop doesn't flood the array.

**Logs `el.updated(changedProps)`**

After R2-A records reasons, the patched `updated()` calls `_logLitChanges()`, which prints a grouped console log:
```
[LdsPropAudit] <rock-grid> — 2 prop(s) changed
  data     before: Array[0]  after: Array[48]
  loading  before: true      after: false
  update triggered by     ← console.trace() here
```

---

## The data shape

```js
// R2-A — render reasons
window.__LDS_RENDER_REASONS__
// { [tagName]: [ ...last 50 entries ] }
// Each entry: { prop, oldSummary, newSummary, sameRef, ts }

window.__LDS_RENDER_REASONS__['rock-grid']
// [
//   { prop: "data", oldSummary: "Array[0]", newSummary: "Array[48]", sameRef: false, ts: "..." },
//   { prop: "loading", oldSummary: "true", newSummary: "false", sameRef: false, ts: "..." },
//   ...
// ]

// R2-B — thrash incidents
window.__LDS_THRASH__
// [{ tag, prop, count, windowMs, ts, stack }]

window.__LDS_THRASH__[0]
// {
//   tag:      "rock-grid",
//   prop:     "selection",
//   count:    8,
//   windowMs: 1000,
//   ts:       "2026-10-06T10:20:15.000Z",
//   stack:    "Error\n  at rock-grid.js:92\n..."
// }
```

**Value summaries** in `oldSummary`/`newSummary` are intentionally compact:
- Strings: quoted, truncated to 50 chars
- Arrays: `Array[N]` with a `(same ref ⚠️)` marker if the reference didn't change
- Objects: `{key1,key2,key3}` + same-ref marker
- Primitives: raw value as string

---

## Console output

When `__LDS_PROP_DEBUG__` matches an element, every update produces a `console.groupCollapsed` log:

```
▶ [LdsPropAudit] <rock-grid> — 2 prop(s) changed
    data     before: Array[0]  after: Array[48]
    loading  before: "true"    after: "false"
  update triggered by   (stack trace)
```

The `console.trace()` call is where the value is — it shows exactly which line of your code set the property that triggered the render.

---

## Pinpoint integration

Thrash incidents from `window.__LDS_THRASH__` feed a Pinpoint finding:

| Condition | Finding type | Evidence level |
|-----------|-------------|----------------|
| `thrash.length > 0` for a component | `prop-thrash` | `attribution` (stack in entry) |
| `sameRef: true` appears frequently in render reasons | `same-ref-update` | `observation` |

---

## Reliability

**High:** Thrash detection is deterministic. If an entry appears in `__LDS_THRASH__`, that property was definitely written more than N times in 1000ms on that element.

**Medium:** Render reasons from R2-A are accurate for named Lit properties. They won't capture updates triggered by `this.requestUpdate()` calls without a property name (e.g., imperative re-renders).

**Note:** The patch is applied per-element instance, not per class. Elements that were already mounted when `__LDS_PROP_DEBUG__` was set are not patched. Either set the flag before mount or trigger a remount.

---

## Limitations

**Lit-specific.** Both R2-A and R2-B hook `requestUpdate` and `updated()`, which are Lit lifecycle methods. Plain custom elements or non-Lit frameworks get no data.

**No dedicated panel tab.** Output goes to the browser console and to `window.__LDS_RENDER_REASONS__` / `window.__LDS_THRASH__`. The Perf tab shows render counts but not render reasons. A dedicated "Prop Audit" tab is a missing feature.

**Per-instance patch, not prototype.** Patching happens in `attach(el)`. This means each element instance has its own patched methods. Memory-efficient, but it means you need the element to remount to apply the patch if you enable the flag late.

**Thrash window is fixed at 1000ms.** Writes that happen in bursts slower than once per second (e.g., animation-frame churn) won't be caught by the 1000ms window.

**`sameRef` detection only works for objects/arrays.** Primitive thrash (rapidly toggling a boolean) is counted in `count` but not flagged as a same-ref issue.

---

## What can improve

1. **Dedicated Prop Audit panel tab** showing render reasons in a timeline view instead of just the console.
2. **Heat map per prop** — which prop is responsible for the most render-triggers across the session, sorted descending.
3. **Configurable thrash window.** 1000ms is arbitrary. A configurable `__LDS_THRASH_WINDOW_MS__` would help teams with different rendering cadences.
4. **Prototype-level patch option.** An opt-in to patch the class prototype once, so all instances (present and future) are covered without per-element overhead.
5. **`sameRef` auto-recommendation.** When `sameRef: true` appears for an array/object, automatically suggest: "consider using an immutable update pattern."

---

## How it makes life easier

- **No "why did this render?" mystery.** The console log tells you exactly which prop changed, with old/new values and a stack trace, without adding any code.
- **Catches same-reference bugs.** `sameRef: true` in the output immediately reveals the pattern where `this.items = this.items` triggers an unnecessary render because `requestUpdate` was called explicitly.
- **Thrash finds the noisy prop.** In a component receiving data from multiple sources, R2-B identifies which specific prop is being written from too many places.

---

## What you'll see

**In the browser console** — every time the target component updates, a grouped log appears:

```
▶ [LdsPropAudit] <rock-grid> — 2 prop(s) changed
    data     before: Array[0]  after: Array[48]
    loading  before: "true"    after: "false"
  update triggered by   (click to expand stack trace)
```

- `before` / `after` summaries tell you what changed
- `(same ref ⚠️)` next to a value means the same object/array reference was passed — a re-render for no actual data change
- The stack trace (expand the `update triggered by` line) shows exactly which line of your code set the property

**In the Pinpoint tab** — a `prop-thrash` card appears if any property was written more than 5 times in 1000ms on the target component.

---

## Reading the results

| What you see | What it means |
|---|---|
| A prop logs on every interaction | Expected — that prop is the trigger for this render |
| Same prop logs repeatedly with identical values | Upstream code is writing the prop unnecessarily |
| `(same ref ⚠️)` on an array/object | Mutation pattern bug — the array/object was mutated instead of replaced |
| `window.__LDS_THRASH__` has entries | A prop is being written from multiple places simultaneously |
| Console logs appear with no user interaction | The component is being driven by a timer or external event |

---

## Step-by-step: a component re-renders too often

1. `window.__LDS_PROP_DEBUG__ = 'your-component-tag'` (no reload needed)
2. Interact with the feature that causes excessive renders
3. Watch the console — each grouped log = one render. The stack trace shows who triggered it
4. If the same prop shows `(same ref ⚠️)` repeatedly: mutation bug → fix: use `this.items = [...this.items, newItem]` instead of `this.items.push(newItem)`
5. Check `window.__LDS_THRASH__` — if entries exist, the named prop is being written from multiple places in the same 1000ms window
6. Open Pinpoint → look for `prop-thrash` or `same-ref-update` findings → export for Claude Code

## Step-by-step: I see jank but don't know which prop is causing it

1. `window.__LDS_PROP_DEBUG__ = '*'` — targets all components (noisy — narrow down quickly)
2. Interact with the feature causing jank
3. In the console, scan for which component logs appear most frequently
4. Switch to `window.__LDS_PROP_DEBUG__ = 'that-component'` and repeat
5. Look for a prop that appears in every render group — that's your culprit

---

## Sanity check

```js
// Confirm the tool is active — interact with the target component.
// If no console logs appear: the element was already mounted before the flag was set.
// Trigger a remount by navigating away and back, or:
window.__LDS_PROP_DEBUG__ = false;
window.__LDS_PROP_DEBUG__ = 'rock-grid';
// then navigate to the page fresh

// Check thrash directly:
window.__LDS_THRASH__   // [] means no thrash detected
```

---

## Complete example

```js
// 1. Target the component you're investigating
window.__LDS_PROP_DEBUG__ = 'product-filter';

// 2. Use the feature that triggers re-renders
// (interact with the filter, change selections, etc.)

// 3. Check render reasons in console
//    [LdsPropAudit] <product-filter> — 1 prop(s) changed
//      selectedIds  before: Array[3] (same ref ⚠️)  after: Array[3] (same ref ⚠️)
//    → Same-reference array push! Fix: this.selectedIds = [...this.selectedIds, id]

// 4. Check for thrash
window.__LDS_THRASH__
// [{ tag: "product-filter", prop: "query", count: 9, windowMs: 1000 }]
// → 9 writes to "query" in 1 second — check if keydown and search-submit both write it
```
