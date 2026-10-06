# Performance Monitor — `__LDS_PERF_ENABLED__`

**Source:** `src/core/perf.js`  
**Panel tab:** Perf  
**Data globals:** `window.__LDS_PERF__`, `window.__LDS_SLOW_RENDERS__`

---

## What it is

Measures how long each LitElement component takes to render — from `connectedCallback` until its first committed DOM update. Every mount of every tracked element is timed and aggregated by tag name.

---

## The problem it solves

Your page feels slow on first load. DevTools → Performance → flame graph shows a 700ms scripting block. Which component? You can't tell without drilling through dozens of anonymous function calls and cross-referencing with source maps.

The alternative: add `console.time()`, rebuild, reload, reproduce. Repeat for each suspect. Ten minutes per data point.

The Performance Monitor answers "which component is slowest" automatically, for every component, for your entire session, without a build step.

---

## How to enable

```js
// Standalone — only the perf tool
window.__LDS_PERF_ENABLED__ = true;

// Or via master flag
window.__LDS_DEBUG__ = { perf: true };
```

Must be set before elements mount. Reload after setting for a clean session.

---

## How it works

`attach(el)` is called from `LitDebugMixin.connectedCallback`. It records `t0 = performance.now()`, then:

**Lit path** — if `el.updateComplete` exists (a LitElement), it waits for `updateComplete.then()` which resolves after the first committed DOM update, then records `t1 - t0`.

**Fallback path** — for non-Lit elements, the fallback measures the synchronous duration of `connectedCallback` itself (less accurate — misses async rendering).

Why `updateComplete` and not `updated()`? `updated()` fires synchronously during the update cycle. `updateComplete` resolves as a microtask after the full cycle — it's the earliest moment the rendered output is stable.

```
connectedCallback()         updateComplete resolves
    │                              │
    ├─ properties set              │
    ├─ render() runs               │
    ├─ DOM patched                 │
    ├─ updated() fires             │
    │                              │
    t0 ────────────────────────── t1
    │←──────── TTI measured ──────→│
```

---

## The data shape

```js
window.__LDS_PERF__
// { [tagName]: { count, totalMs, maxMs, minMs, samples } }

{
  "rock-grid": {
    count:   47,         // total mount count this session
    totalMs: 18682,      // sum of all TTI measurements (avgMs = totalMs/count)
    maxMs:   1243,       // worst single render
    minMs:   82,         // best single render
    samples: [212, 345, 823, 91, ...]  // last 20 measurements (ring buffer, oldest dropped)
  },
  "product-tile": {
    count:   192,
    totalMs: 8064,
    maxMs:   184,
    minMs:   28,
    samples: [41, 38, 55, 44, ...]
  }
}
```

**Note:** `avgMs` is not stored — derive it as `Math.round(totalMs / count)`.

---

## Slow render detection

Any render over **500ms** (hard-coded threshold) triggers a `console.warn` and adds an entry to `window.__LDS_SLOW_RENDERS__`.

```
⚠ [LdsPerfMonitor] <rock-grid> slow render: 823ms
```

The slow renders log captures the last 100 events, each with a stack trace. This stack trace is what populates the `attribution` evidence level in Pinpoint findings.

```js
window.__LDS_SLOW_RENDERS__
// [{ tag: "rock-grid", ms: 823, ts: "2026-10-06T10:14:32.110Z", stack: "Error\n  at..." }]
```

---

## Console commands

```js
// Sorted report — slowest component first
window.__LDS_PERF_REPORT__()
// Prints console.table, returns array

// Raw live data
window.__LDS_PERF__

// Slow renders with stacks
window.__LDS_SLOW_RENDERS__

// Clear all data — start fresh
window.__LDS_PERF_RESET__()
```

---

## Pinpoint integration

Perf data feeds two Pinpoint finding types:

| Condition | Finding type | Evidence level |
|-----------|-------------|----------------|
| `avgMs > 300` | `slow-render` | `observation` |
| `avgMs > 300` AND stack found in `__LDS_SLOW_RENDERS__` | `slow-render` | `attribution` (file + line shown) |
| `count` abnormally high relative to other elements | `excessive-renders` | `correlation` |

`attribution`-level findings show the source file and line in the Pinpoint card and include them in the Fix Table export.

---

## Reliability

**High confidence:**
- `count` is exact — simple integer increment on every mount.
- Relative ranking (A is slower than B) is reliable even if absolute numbers vary.
- `maxMs` is real — that slow render happened.

**Lower confidence:**
- `avgMs` on count: 1 is a single data point, possibly a cold-start.
- Absolute milliseconds are machine-specific — a 200ms result on a dev MacBook may be 1200ms on a low-end device.
- First-run renders include JIT compilation cost. Mount the component several times before drawing conclusions.

**Not reliable:**
- Mounts that happened before the flag was set are not captured. Always reload after enabling.
- Async work triggered from `updated()` is not included in TTI. A component that shows data after a fetch looks fast in the Perf tab but may feel slow to the user.

---

## Limitations

**Initial mount only.** Subsequent re-renders (property changes, parent updates) are not timed. For re-render performance, use `__LDS_PROP_DEBUG__`.

**Per-tag aggregation.** All 50 instances of `<product-tile>` contribute to one entry. You cannot identify which specific instance was slow. Use `__LDS_INSPECTOR__` for instance-level debugging.

**Mixin dependency.** Only elements using `LitDebugMixin` are tracked. Third-party elements and un-migrated components are invisible.

**Async-render blind spot.**
```js
connectedCallback() {
  super.connectedCallback();
  // updateComplete resolves here — TTI reads as fast
}
updated() {
  this.fetchData().then(data => { this.data = data; }); // second render not measured
}
```

**DevTools CPU throttling inflates readings.** Expected — it reflects slower hardware — but be aware when comparing against un-throttled baselines.

---

## What can improve

1. **Configurable slow threshold.** 500ms is hard-coded. `window.__LDS_SLOW_RENDER_THRESHOLD_MS__ = 200` would let teams set their own bar.
2. **Re-render measurement.** Hook `willUpdate`/`updated` to also time subsequent renders, not just initial mount.
3. **P95/P99 instead of only max.** `maxMs` is sensitive to outliers. Percentiles would give a more stable signal for high-count components.
4. **`reportTTI()` manual method.** Let components self-report when they are truly interactive (e.g., after data loads), for more accurate user-facing measurement.
5. **Render count by visibility cycle.** Pair `count` with `__LDS_MOUNT_CYCLES__` data to distinguish 200 mounts across 10 navigation cycles (fine) from 200 mounts in one cycle (suspicious).

---

## How it makes life easier

- **10-minute DevTools investigation → 30 seconds.** Open the panel, read the sorted table.
- **No code changes.** No `console.time()`, no instrumentation, no rebuild cycle.
- **Session-persistent.** Navigate through your app, exercise all routes, then read a single report covering everything.
- **Feeds Pinpoint automatically.** When avgMs > 300ms with a stack trace, Pinpoint shows a file and line in the finding card — paste it straight into Fix Table → Claude Code.

---

## What you'll see in the Perf tab

The Perf tab shows a table sorted by average render time, slowest first:

```
┌─────────────────┬─────────┬────────┬────────┬────────┐
│ tag             │ renders │ avg ms │ max ms │ min ms │
├─────────────────┼─────────┼────────┼────────┼────────┤
│ rock-grid       │ 47      │ 397    │ 1243   │ 82     │  ← highlighted (> 300ms)
│ product-filter  │ 12      │ 143    │ 310    │ 88     │
│ product-tile    │ 192     │ 42     │ 184    │ 28     │  ← fine
└─────────────────┴─────────┴────────┴────────┴────────┘
```

- Rows where avg ms > 300ms are highlighted
- A 🔥 badge appears on rows with a matching stack trace in `__LDS_SLOW_RENDERS__` — Pinpoint will show a file + line for these

If the table is empty after a page load: the flag was set after elements mounted. Reload.

---

## Reading the numbers

| avg ms range | What it means |
|---|---|
| < 100ms | Fast — no action needed |
| 100–300ms | Acceptable on most devices — watch but don't act |
| > 300ms | Investigate — Pinpoint will flag this |
| > 500ms | Slow render warning captured; stack trace available in Pinpoint |

**renders count context:**
- A count of 1 is a single data point (possibly cold-start JIT) — navigate to the page again before drawing conclusions
- A count unexpectedly high (e.g., 200 for a component that should mount once) indicates excessive re-renders — switch to [Prop Audit](02-prop-audit.md)

**Numbers are machine-specific.** A 200ms result on a dev MacBook may be 800ms on a low-end device. Use DevTools CPU throttling (4× slowdown) when measuring for production-realistic numbers.

---

## Step-by-step: my page loads slowly

1. In DevTools console: `window.__LDS_PERF_ENABLED__ = true`
2. **Reload the page** — the flag must be set before elements mount
3. Navigate through the page normally — let everything render, open a modal, scroll
4. Click 🐞 → **Perf tab** — top row is your bottleneck
5. If avg ms > 500 and there's a 🔥 badge: open **Pinpoint tab** → find the `slow-render` card → copy the `readHint` value (file + line) and paste it to Claude Code
6. If renders count is unexpectedly high: the component is re-rendering excessively → switch to `__LDS_PROP_DEBUG__ = 'that-tag'` to find what's triggering the extra renders

---

## Sanity check

```js
// Confirm the tool is collecting data:
Object.keys(window.__LDS_PERF__)
// [] → flag was set after mount, or LitDebugMixin not installed → reload

// Quick sorted report in console:
window.__LDS_PERF_REPORT__()
```

---

## Complete example

```js
// 1. Enable before page load
window.__LDS_PERF_ENABLED__ = true;

// 2. Reload + use the app normally

// 3. Read the report
window.__LDS_PERF_REPORT__();
// ┌─────────────────┬─────────┬────────┬────────┬────────┐
// │ tag             │ renders │ avg ms │ max ms │ min ms │
// ├─────────────────┼─────────┼────────┼────────┼────────┤
// │ rock-grid       │ 47      │ 397    │ 1243   │ 82     │ ← investigate
// │ product-filter  │ 12      │ 143    │ 310    │ 88     │
// │ product-tile    │ 192     │ 42     │ 184    │ 28     │ ← fine
// └─────────────────┴─────────┴────────┴────────┴────────┘

// 4. Check the slow renders stack for rock-grid
window.__LDS_SLOW_RENDERS__[0].stack
// → "...at rock-grid.js:184..."

// 5. Apply fix, reset, re-measure
window.__LDS_PERF_RESET__();
// navigate to the page again...
window.__LDS_PERF_REPORT__();
// rock-grid: avg 68ms ✓
```
