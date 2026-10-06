# Web Vitals — `__LDS_VITALS_ENABLED__`

**Source:** `src/core/vitals.js`  
**Panel tab:** Vitals  
**Data globals:** `window.__LDS_VITALS__`

---

## What it is

Measures Core Web Vitals and Long Tasks for the current page using the browser's `PerformanceObserver` API. No external library. No sampling. Runs once per page load and updates in real time as new data arrives.

The four metrics tracked:

| Metric | Full name | What it measures |
|--------|-----------|-----------------|
| **LCP** | Largest Contentful Paint | When the largest image or text block became visible |
| **CLS** | Cumulative Layout Shift | Total unexpected layout movement across the page lifetime |
| **INP** | Interaction to Next Paint | Worst interaction delay (or FID if INP not supported) |
| **Long Tasks** | — | Script blocks >50ms that freeze the main thread |

---

## The problem it solves

You're investigating user-reported slowness. DevTools shows no slow renders. The Network tab looks clean. But something feels wrong on the first load.

LCP tells you the page's visible render time from the user's perspective. Long Tasks tell you which script blocks are freezing the thread. CLS tells you if layout shifts are breaking the experience. Together they give a user-perceived performance picture that component-level tools can't provide.

---

## How to enable

```js
// Standalone
window.__LDS_VITALS_ENABLED__ = true;

// Or via master flag
window.__LDS_DEBUG__ = { vitals: true };
```

`LdsVitals.init()` is called once from the first `LitDebugMixin.connectedCallback` when the flag is set. Subsequent calls are no-ops (`_initialized` guard). It is page-level, not per-element.

For best results, **set the flag before page load** so LCP and long tasks from initial rendering are captured.

---

## How it works

`init()` registers four `PerformanceObserver` instances, each with `buffered: true` so they pick up entries that already happened before the observer was registered:

**LCP** — `largest-contentful-paint`  
Takes the last entry (most recent LCP candidate). Stores `startTime` as `valueMs`, the element's tag name, and its URL if it's an image.

**CLS** — `layout-shift`  
Accumulates all non-input-triggered shifts. Each shift entry is pushed to `entries[]` (capped at 20), with the contributing element tags. `value` is the running total.

**INP** — `event` (with `durationThreshold: 40`)  
Records the worst interaction seen (`Math.max` over all event entries). Falls back to `first-input` if the `event` type is not supported.

**Long Tasks** — `longtask`  
Every task >50ms is pushed to `longTasks[]` (capped at 100). Each entry has `durationMs` and `ts`.

---

## The data shape

```js
window.__LDS_VITALS__
// {
//   lcp:       { valueMs, element, url, ts },
//   cls:       { value, entries[] },
//   inp:       { valueMs, eventType, ts },
//   longTasks: [{ durationMs, ts }]
// }

window.__LDS_VITALS__
// {
//   lcp: {
//     valueMs: 2340,
//     element: "img",            // tagName of the LCP element
//     url:     "/images/hero.jpg",
//     ts:      "2026-10-06T10:00:00.000Z"
//   },
//   cls: {
//     value:   0.043,            // total cumulative shift (0.1 = "good" threshold)
//     entries: [
//       { value: 0.031, sources: ["product-tile", "nav-header"], ts: "..." },
//       { value: 0.012, sources: ["footer-ad"], ts: "..." }
//     ]
//   },
//   inp: {
//     valueMs:   180,
//     eventType: "click",
//     ts:        "2026-10-06T10:14:05.000Z"
//   },
//   longTasks: [
//     { durationMs: 823, ts: "2026-10-06T10:00:02.000Z" },
//     { durationMs: 124, ts: "2026-10-06T10:14:32.000Z" }
//   ]
// }
```

---

## Panel: Vitals tab + Summary tab

The **Vitals tab** shows the four metrics with colour-coded status:

| Metric | Good | Needs improvement | Poor |
|--------|------|------------------|------|
| LCP | < 2500ms | 2500–4000ms | > 4000ms |
| CLS | < 0.1 | 0.1–0.25 | > 0.25 |
| INP | < 200ms | 200–500ms | > 500ms |

Long Tasks are shown as a list of script blocks, longest first.

The **Summary tab** shows LCP, CLS, and INP as header chips next to the health score.

LCP and CLS feed the page health score: `score -= 25/12` for poor/needs-improvement LCP; high long task counts reduce the score.

---

## Reliability

**LCP:** Reliable for pages that don't manually trigger LCP updates after load. On infinite-scroll or lazy-image pages, LCP may update to a later element.

**CLS:** Reliable for layout shifts observable after `init()`. Shifts that happened before the observer registered (rare with `buffered: true`, but possible in very early-loading pages) may be missed.

**INP:** Falls back to FID in browsers that don't support `event` entry type (Safari pre-17). FID measures only the first interaction, not the worst. The distinction matters for pages with interactions that get slower over time.

**Long Tasks:** Reported by the browser as script blocks >50ms on the main thread. They are real. However, they don't tell you *which* code caused the long task — you get duration and timestamp but not a stack trace. Correlate with Perf tab timing to identify suspects.

---

## Limitations

**Page-level tool only.** Vitals are per-page, not per-component. LCP tells you the page is slow — Perf Monitor tells you which component is the bottleneck.

**LCP is the last candidate, not the final.** Browsers may update the LCP candidate multiple times. `window.__LDS_VITALS__.lcp` reflects the most recent candidate seen by the observer. In some cases this is not the "true" LCP the browser would report in Lighthouse.

**CLS entries capped at 20.** On animation-heavy pages, older shift events are dropped. `value` (the running total) is accurate; the `entries[]` list may be incomplete.

**No PerformanceObserver in Node or SSR environments.** `init()` silently skips on `typeof PerformanceObserver === 'undefined'`.

**INP tracks worst interaction, not average.** A single slow interaction inflates INP even if all others are fast. This is intentional (matches Web Vitals spec) but can be misleading on pages where one interaction is inherently heavy (e.g., a complex form submission).

---

## What can improve

1. **Long Task attribution.** The `longtask` entry type's `attribution` field can sometimes identify the script source. Extracting and storing it would bridge the gap between "there was a long task" and "which code caused it."
2. **FID → INP migration notice.** When the browser falls back to FID, the panel should indicate "INP not supported — showing FID" to avoid confusion.
3. **LCP element highlight.** When `lcp.element` is known, offer a "highlight element" button that outlines the LCP element in the page.
4. **CLS timeline.** A timeline of CLS events with source elements over time, so layout shifts after initial load (e.g., from lazy ads) are visible.
5. **Long task histogram.** A count by duration bucket (50–100ms, 100–300ms, >300ms) to distinguish one catastrophic block from many moderate ones.

---

## How it makes life easier

- **Answers "is this page fast enough?"** before any user testing. LCP < 2500ms and CLS < 0.1 means it meets Core Web Vitals thresholds. LCP > 4000ms means it will hurt SEO and user satisfaction.
- **Connects to component-level work.** Long Task timestamp + Perf tab timing = "that 823ms long task coincides with `<rock-grid>` mounting" — a concrete connection from page-level symptom to component-level cause.
- **Included in the exported JSON report.** When a user reports a slow page, their vitals snapshot travels with the report — you get LCP, INP, and long task count without asking them to run Lighthouse.

---

## What you'll see in the Vitals tab

The Vitals tab shows four metric blocks with colour-coded status:

```
LCP   2340ms  ●  Needs improvement    (good: < 2500ms)
CLS   0.012   ●  Good                 (good: < 0.1)
INP   180ms   ●  Good                 (good: < 200ms)

Long Tasks
  823ms  at 10:00:02
  124ms  at 10:14:32
```

The **Summary tab** also shows LCP, CLS, and INP as header chips next to the health score.

Status thresholds:

| Metric | Good | Needs improvement | Poor |
|--------|------|------------------|------|
| LCP | < 2500ms | 2500–4000ms | > 4000ms |
| CLS | < 0.1 | 0.1–0.25 | > 0.25 |
| INP | < 200ms | 200–500ms | > 500ms |

---

## Reading the results

| What you see | What it means |
|---|---|
| LCP > 2500ms | The largest visible element took too long to appear — find the bottleneck with the Perf tab |
| CLS > 0.1 | Layout is shifting visibly — something is loading asynchronously and pushing other elements |
| INP > 200ms | An interaction (click, keypress) is blocked for too long — a Long Task during that interaction is the likely cause |
| Long Task > 200ms at the same time as LCP | The render of the LCP element is blocking the main thread — check the Perf tab for which component |
| Multiple Long Tasks spread through the session | The page has ongoing blocking work (heavy data processing, large renders) |

---

## Step-by-step: the page feels slow but DevTools shows no slow network calls

1. `window.__LDS_VITALS_ENABLED__ = true` → reload
2. Load the page and interact normally
3. Open panel → **Vitals tab**
4. Check LCP — if > 2500ms, the visible render is slow. Correlate with Perf tab: which component's max ms matches the LCP timestamp?
5. Check Long Tasks — if there are tasks > 100ms: that's scripting blocking the thread. Their timestamps should correspond to slow renders in the Perf tab
6. Cross-reference:
   ```js
   window.__LDS_VITALS__.longTasks[0].ts  // when the long task fired
   // Compare with Perf tab — which component has a similar maxMs timing?
   ```

---

## Sanity check

```js
// Confirm vitals are being collected:
window.__LDS_VITALS__
// { lcp: null, cls: { value: 0, entries: [] }, inp: null, longTasks: [] }
// → tool initialized but no data yet — reload with the flag set and let the page fully load

// LCP won't populate until the largest element is visible.
// Trigger LCP by letting the above-fold content fully render.
window.__LDS_VITALS__.lcp   // null → page hasn't rendered its LCP candidate yet
```

---

## Complete example

```js
// 1. Enable before page load
window.__LDS_VITALS_ENABLED__ = true;

// 2. Page loads, user interacts

// 3. Read vitals
window.__LDS_VITALS__
// LCP 3240ms → needs improvement
// CLS 0.012  → good
// INP 180ms  → good
// Long Tasks: 2 tasks (823ms, 124ms)

// 4. Correlate: was the 823ms long task caused by rock-grid?
window.__LDS_VITALS__.longTasks[0].ts  // "2026-10-06T10:00:02.000Z"
window.__LDS_PERF__['rock-grid']       // count: 1, maxMs: 823
// → Same timestamp window — rock-grid is the LCP bottleneck

// 5. Panel: Vitals tab shows LCP in amber, long tasks list
```
