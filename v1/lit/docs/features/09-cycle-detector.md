# Cycle Detector — `__LDS_CYCLE_DETECT__`

**Source:** `src/core/cycle-detector.js`  
**Panel tab:** None dedicated — findings appear in Pinpoint  
**Data globals:** `window.__LDS_CYCLES__`

> **No panel tab.** Cycle Detector findings appear in the **Pinpoint tab** as `circular-update` cards. If the page is genuinely hanging from a render loop, open the panel and check Pinpoint — the cycle path is there.

---

## What it is

Detects circular property-update chains between components — the situation where component A's render triggers a property update on B, which triggers a property update back on A (or through a chain of components). These cycles cause infinite rendering loops, browser freezes, and "Maximum update depth exceeded" style errors.

The detector runs at runtime by building a directed graph of "who triggered whose render" and running a DFS (depth-first search) on it to detect cycles.

---

## The problem it solves

You have a parent component that passes props to a child. The child dispatches an event that updates the parent's state, which re-renders the child with new props, which re-dispatches the event. The browser hangs. You see a "Too much recursion" error in the console or the page stops responding entirely.

Finding the cycle manually requires setting breakpoints in multiple components' `updated()` calls, tracking the update chain by hand. For chains longer than two components (A → B → C → A), this is extremely tedious.

The Cycle Detector identifies the chain automatically: "rock-grid → product-tile → rock-grid" — you see the exact path in `window.__LDS_CYCLES__`.

---

## How to enable

```js
// Standalone
window.__LDS_CYCLE_DETECT__ = true;

// Or via master flag
window.__LDS_DEBUG__ = { cycleDetector: true };
```

The detector hooks methods on each element when it mounts. Elements mounted before the flag was set are not patched. Reload after enabling for full coverage.

---

## How it works

`attach(el)` patches two Lit methods on the element instance:

**1. `performUpdate` — tracks which element is currently rendering**

The async `performUpdate` method is wrapped to increment a counter in `_updatingCounts` (a `Map<tagName, count>`) when an element starts rendering, and decrement it when rendering finishes. Multiple instances of the same tag each add/remove from the same counter. If a component is inside a render, its tag has a non-zero count.

**2. `requestUpdate` — detects cross-element update triggers**

When an element calls `requestUpdate` (i.e., it's requesting a re-render), the wrapper checks: is any *other* tag currently in `_updatingCounts`? If yes, we add a directed edge to the update graph: `updatingTag → thisTag` (meaning "tag X's render triggered tag Y's update").

After adding the edge, it runs `_findCycle(thisTag)` — a DFS from the just-updated tag looking for a path back to itself.

```
_updateGraph structure:
  Map<tagName, Set<tagName>>
  { "rock-grid": Set { "product-tile" },
    "product-tile": Set { "rock-grid" } }   ← cycle!
```

When a cycle is found, a `{ path, count, prop, ts, stack }` entry is pushed to `window.__LDS_CYCLES__`. Subsequent identical cycles increment `count` rather than creating new entries.

---

## The data shape

```js
window.__LDS_CYCLES__
// [{ path, count, prop, ts, stack }]
// Capped at 100 entries.

window.__LDS_CYCLES__[0]
// {
//   path:  "rock-grid → product-tile → rock-grid",  // the full cycle as a string
//   count: 47,         // how many times this exact cycle fired
//   prop:  "selected", // the property name that triggered the final link (if named)
//   ts:    "2026-10-06T10:14:32.110Z",  // when first detected
//   stack: "Error\n  at rock-grid.js:184\n  at..."   // 6 frames
// }
```

---

## Console commands

```js
// Summarise detected cycles
window.__LDS_CYCLES_REPORT__()
// [LdsCycleDetector] 1 cycle(s) detected
// ┌──────────────────────────────────────────┬───────┬────────────┐
// │ path                                     │ count │ first      │
// ├──────────────────────────────────────────┼───────┼────────────┤
// │ rock-grid → product-tile → rock-grid     │ 47    │ 10:14:32   │
// └──────────────────────────────────────────┴───────┴────────────┘

// No cycles
window.__LDS_CYCLES_REPORT__()
// [LdsCycleDetector] No cycles detected ✓

// Full data
window.__LDS_CYCLES__
```

---

## Pinpoint integration

Cycles feed a Pinpoint finding:

| Condition | Finding type | Evidence level |
|-----------|-------------|----------------|
| `cycles.length > 0` | `circular-update` | `attribution` (stack + path) |

The `path` string appears as the issue details. The `stack` from the first detected cycle provides the file/line for `attribution` evidence level.

> **Note:** `circular-update` findings cannot be verified through the Phase 8 verification loop. Cycles are detected in real time during rendering and don't produce before/after metrics.

---

## Reliability

**High:** When a cycle is detected, it is real. The directed graph and DFS are deterministic — if `path` appears in `window.__LDS_CYCLES__`, those components genuinely triggered each other's renders.

**Important nuance — directed graph accumulation:** The `_updateGraph` is never cleared between detections. Once an edge `A → B` is added, it stays. This means that in a long session where A updated B legitimately once and B updated A legitimately once (not a cycle at those moments), the accumulated graph will show a cycle even though neither update was circular. In practice this is uncommon because the cycle check only fires when element A is in `performUpdate` AND element B calls `requestUpdate` — i.e., the circular path must actually happen within the same synchronous render tick.

**Per-tag granularity.** The detector tracks by tag name, not by instance. If `rock-grid` instance 1 legitimately updates `product-tile`, and `product-tile` instance 2 updates `rock-grid` instance 2 in a separate unrelated interaction, the graph shows the same edge `rock-grid → product-tile → rock-grid` and may report a false cycle. Instance-level tracking would require storing element references, which would prevent GC.

---

## Limitations

**Lit-specific.** Both `performUpdate` and `requestUpdate` are Lit lifecycle methods. Plain custom elements or other frameworks are not covered.

**Graph is never cleared.** The `_updateGraph` accumulates edges for the entire session. Long sessions or complex apps may accumulate phantom edges that produce false-positive cycle reports. Call `window.__LDS_CYCLES__ = []` (does not clear the graph; that requires a reload) to keep the report clean.

**No per-instance tracking.** As noted above, cycles are detected at tag-name granularity. A false positive is possible when two separate instances of the same component pair interact in opposite directions during the same session.

**Cannot detect async cycles.** A cycle where A renders, then B's `updated()` calls a `setTimeout()` that eventually triggers A's re-render is not detected — by the time A's re-render happens, B is no longer in `performUpdate`.

---

## What can improve

1. **Session-resettable graph.** `window.__LDS_CYCLES_RESET__()` should clear the `_updateGraph` as well as `__LDS_CYCLES__`.
2. **Instance-level tracking option.** Opt-in mode that tracks cycles per element instance (accepting the GC cost) to eliminate false positives from tag-level deduplication.
3. **Async cycle detection.** Track cycles that happen within a configurable time window (e.g., same RAF frame) even if not synchronously triggered.
4. **Visual indicator in panel.** A count badge on the panel header (like the error badge) when cycles are detected, so it's immediately visible without opening Pinpoint.

---

## How it makes life easier

- **Answers "is there a render loop?" definitively.** No more manually instrumenting `performUpdate` to count calls. The cycle path string tells you exactly which components form the loop.
- **Catches multi-hop cycles.** A → B → C → A is just as visible as A → A. DevTools doesn't surface this; the Cycle Detector does.
- **Count tells you severity.** `count: 47` after a single user interaction = render loop that ran 47 times. `count: 1` = cycle that fired once and self-resolved (less urgent).

---

## What you'll see

**In the browser console** — when a cycle fires, a warning appears immediately:

```
[LdsCycleDetector] Cycle detected: rock-grid → product-tile → rock-grid (count: 47)
```

**In the Pinpoint tab** — a `circular-update` card:

```
[HIGH] circular-update                                attribution
rock-grid
rock-grid → product-tile → rock-grid (count: 47)
product-tile.js line 92
→ "Remove or gate the cross-component property write at product-tile.js:92"
```

- `path` shows the full cycle chain as a human-readable string
- `count` tells you how many times the cycle ran (47 = render loop, 1 = fired once and stopped)
- File + line from the stack trace shows exactly where the last link in the cycle was triggered

---

## Reading the results

| What you see | What it means |
|---|---|
| `count: 1` | Cycle fired once and self-resolved — lower urgency, but still investigate |
| `count: 47` (high) | Active render loop — the page ran 47 extra renders from one user action |
| Long path (A→B→C→D→A) | Multi-hop cycle — harder to find manually; the path string tells you all the components involved |
| Cycle reported but page seems fine | May be a false positive from accumulated graph edges — see Reliability section |

---

## Step-by-step: the page hangs / browser freezes on interaction

1. `window.__LDS_CYCLE_DETECT__ = true` → reload
2. Perform the interaction that causes the hang
3. Check console immediately for `[LdsCycleDetector] Cycle detected:` messages
4. Open panel → **Pinpoint tab** → find the `circular-update` card
5. Read `window.__LDS_CYCLES__[0].stack` — the stack trace shows the exact line that triggers the final link in the cycle
6. That line is setting a property on another component from inside a render — add a guard: `if (this.value !== newValue) { parent.value = newValue; }`

---

## Sanity check

```js
// Confirm the tool is active:
Array.isArray(window.__LDS_CYCLES__)  // true → detector is running

// Quick cycle check:
window.__LDS_CYCLES_REPORT__()
// [LdsCycleDetector] No cycles detected ✓   ← good
// or
// rock-grid → product-tile → rock-grid, count: 47   ← investigate

// After fixing, verify:
window.__LDS_CYCLES__ = [];   // clear the report
// Reproduce the interaction → check again
```

---

## Complete example

```js
// 1. Enable before page load
window.__LDS_CYCLE_DETECT__ = true;

// 2. Interact with the page — if there's a cycle, it fires immediately

// 3. Check
window.__LDS_CYCLES_REPORT__()
// rock-grid → product-tile → rock-grid, count: 47

// 4. Read the stack
window.__LDS_CYCLES__[0].stack
// "Error\n  at product-tile.js:92\n  at LitElement.requestUpdate..."
// → product-tile.js:92 is setting a property on rock-grid during its own render

// 5. Fix: remove or gate the cross-component property write in product-tile.js:92
// Confirm by checking window.__LDS_CYCLES__ is empty after reload + interaction
```
