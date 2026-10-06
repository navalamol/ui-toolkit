# Memory Counters — always on

**Source:** `src/core/memory.js`  
**Panel tab:** Memory  
**Data globals:** `window.__LDS_MEMORY__`, `window.__LDS_STORMS__`, `window.__LDS_MOUNT_CYCLES__`

---

## What it is

Tracks mount and unmount counts for every custom element using `LitDebugMixin`, GC (garbage collection) via `FinalizationRegistry`, mount-storm detection, and cross-session progressive-leak detection via slope analysis across visibility cycles.

This tool is **always active** — it requires no flag and cannot be disabled. The counters are collected as a side effect of `connectedCallback`/`disconnectedCallback` with zero overhead beyond the counter increments.

---

## What it tracks

### Mount/unmount counters

For every element tag:
- `mounted`: incremented on `connectedCallback`
- `unmounted`: incremented on `disconnectedCallback`
- `gcCount`: incremented when a disconnected element is finalized by the GC (via `FinalizationRegistry`)

`active = mounted - unmounted` gives the count of live instances. When `active` grows session-over-session without matching unmounts, that's a leak.

### Storm detection

If a single tag accumulates more than 20 mounts in a session, a `console.warn` fires and a storm entry is recorded:

```
[LdsMemory] mount-storm: <product-tile> — 200 mounts in this session
```

### Visibility cycles (Phase 7)

`document.addEventListener('visibilitychange')` starts a new cycle each time the page becomes visible. Each cycle records per-tag mount/unmount deltas. After ≥3 completed cycles, the progressive-leak detection can determine if `active` count is growing monotonically (slope > 0 across all cycles) — if so, the leak type is `progressive-leak`.

---

## The data shape

```js
// Main memory map
window.__LDS_MEMORY__
// Map<tagName, { mounted, unmounted, gcCount }>

// Iterate:
for (const [tag, d] of window.__LDS_MEMORY__) {
  const active = d.mounted - d.unmounted;
  console.log(tag, { mounted: d.mounted, unmounted: d.unmounted, active, gcCount: d.gcCount });
}
// rock-grid:     { mounted: 47, unmounted: 46, active: 1,  gcCount: 44 }
// product-tile:  { mounted: 192, unmounted: 192, active: 0, gcCount: 190 }

// Storm incidents
window.__LDS_STORMS__
// [{ tag, count, ts, stack }]

// Visibility cycles (Phase 7)
window.__LDS_MOUNT_CYCLES__
// [{
//   cycleId: 1,
//   startTs: "2026-10-06T10:00:00.000Z",
//   endTs:   "2026-10-06T10:05:30.000Z",
//   counts:  { "rock-grid": { mounted: 12, unmounted: 0 } }
// }, ...]
// Capped at last 10 cycles.
```

---

## Console commands

```js
window.__LDS_MEMORY_REPORT__()
// Prints console.table of all tags sorted by active count

window.__LDS_MEMORY_RESET__()
// Clears all counters and cycle data
```

---

## Panel: Memory tab

Shows a table of all tracked tags with mounted / unmounted / active / GC counts. Active count > 3 is highlighted as potentially leaked. Storm incidents appear below the table.

---

## Pinpoint integration

Memory data feeds two finding types:

| Condition | Finding type | Evidence level |
|-----------|-------------|----------------|
| `active > 3` (single session) | `memory-leak` | `observation` |
| `active` grows monotonically across ≥3 cycles | `memory-leak` | `correlation` (`leakType: "progressive-leak"`) |
| `mounted > 20` in session | `mount-storm` | `observation` |

`progressive-leak` is the stronger signal. `observation` on high active count alone may just reflect a heavy but legitimate workflow (e.g., a list that renders 40 items).

---

## Reliability

**High:** Counter increments are synchronous in `connectedCallback`/`disconnectedCallback`. They are exact.

**Medium:** `gcCount` depends on the GC running during the session. A disconnected element that hasn't been GC'd yet has `gcCount === 0` even though it will eventually be collected. Don't use `gcCount === 0` as evidence of a leak; use `active > 0` after expected unmounts.

**Progressive-leak accuracy:** Requires ≥3 completed visibility cycles (tab switching, navigate away+back). In single-page, single-tab usage, cycle data is absent and progressive-leak cannot be assessed.

---

## Limitations

**Mixin dependency.** Only elements using `LitDebugMixin` are counted. Third-party elements are invisible.

**No per-instance tracking.** The map is per-tag. You know 47 instances of `rock-grid` mounted; you don't know which specific instances are still alive.

**FinalizationRegistry is non-deterministic.** The GC runs when the engine decides. In short test sessions, `gcCount` may remain 0 even for correctly-released elements.

**Storm threshold is fixed at 20.** Some legitimate pages (virtualized lists, heavy data grids) mount hundreds of the same element. There is no way to configure the storm threshold today.

---

## What can improve

1. **Configurable storm threshold** via `window.__LDS_STORM_THRESHOLD__`.
2. **Instance IDs in active tracking.** Store a WeakRef per live instance so you can identify which instances are still alive, not just how many.
3. **Cycle count normalization in Pinpoint.** Pair active count with cycle count to distinguish `active: 10 across 1 cycle` (possibly fine) from `active: 10 monotonically growing across 5 cycles` (definite leak).
