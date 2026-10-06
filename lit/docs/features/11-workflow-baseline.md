# Workflow Baseline — `__LDS_WORKFLOW_BASELINE__`

**Source:** `src/panel/LdsDebugPanel.js` (Phase 10)  
**Panel tab:** Summary (collapsible "Workflow Baseline" section)  
**Data globals:** `localStorage` — key `__lds_workflow_baseline_${encodeURIComponent(location.pathname)}`

---

## What it is

Remembers what "normal" looks like for each page so that regressions in render count, mount frequency, or network behaviour are detected automatically the next time the panel opens — without a human comparing two sessions.

You set a baseline once ("this is what a healthy session looks like on /products"). On future sessions, the panel compares current metrics to the stored baseline and highlights any component that is now rendering or mounting significantly more than expected.

---

## The problem it solves

You fix a bug. You re-deploy. A week later, someone notices the products page feels slower. Render count for `<rock-grid>` is now 174 — it was 12 when you set the baseline. Your test suite passed because functional tests verify correct output, not render efficiency.

Without the baseline, this regression goes unnoticed until a user feels it. With it, the panel's Summary tab shows `⚠ rock-grid renders: 174 (baseline: 12, +1350%)` on the first panel open after the regression was introduced.

---

## How to enable

The "Set as baseline" button and divergence display in the Summary tab are **always-on** — they read from localStorage, which is harmless when empty. No flag is needed for the UI.

The gate flag `window.__LDS_WORKFLOW_BASELINE__ = true` exists for future use (e.g., if reading `__LDS_PERF__` at panel-open time ever has overhead), but is not currently required.

---

## How it works

### Setting a baseline

Clicking "📏 Set as baseline" in the Summary tab calls `_captureWorkflowBaseline()`:

```js
// What gets captured:
{
  url:             "https://app.example.com/products",
  capturedAt:      "2026-10-06T12:00:00.000Z",
  renders:         { "rock-grid": 12, "product-tile": 48 },   // from window.__LDS_PERF__[tag].count
  mounts:          { "rock-grid": 1, "product-tile": 1 },     // from window.__LDS_MEMORY__ Map[tag].mounted
  networkCount:    3,                                          // total requests in window.__LDS_NETWORK_LOG__
  networkFailures: 0                                           // requests where isError === true
}
```

This is saved to `localStorage` under the key:
```
__lds_workflow_baseline_<encodeURIComponent(location.pathname)>
```

For example, `/products` → key `__lds_workflow_baseline_%2Fproducts`.

This is **distinct from the Phase 8 baseline** (`__lds_baseline`):
- Phase 8 baseline: per-investigation, used to verify a specific fix. Ephemeral.
- Phase 10 baseline: per-page, captures "normal" for the workflow. Persistent across sessions.

### Divergence detection

On each panel open (when a baseline exists for the current pathname), `_buildWorkflowDivergences()` compares:

**Render counts per tag:**
- If both baseline and current are < 5 renders: skip (noise filter)
- `+50% to +199%`: **warn**
- `+200% or more`: **alert**

**Mount counts per tag:**
- `+100% or more` (doubled): **warn**

**Network failures:**
- Any new failures vs baseline: **warn**

### UI in Summary tab

```
▼ Workflow Baseline                                  ⚠ 1 alert

  Baseline captured: Oct 6, 12:00

  ⚠ rock-grid renders: 174 (baseline: 12, +1350%)   ← alert (red)
  ⚠ product-tile renders: 50 (baseline: 48, +4%)    ← ok (green, shows OK)
  ✓ product-tile renders: 50 (baseline: 48, OK)
  ⚠ rock-grid mounts: 3 (baseline: 1, +200%)        ← warn (amber)

  [Clear baseline]   [Update baseline]
```

The section is collapsible (click the "▼ Workflow Baseline" heading).

---

## The data shape

```js
// localStorage content (not a window global — use panel UI to access)
// Key: __lds_workflow_baseline_%2Fproducts
// Value: JSON string of:
{
  url:             "https://app.example.com/products",
  capturedAt:      "2026-10-06T12:00:00.000Z",
  renders:         { "rock-grid": 12, "product-tile": 48 },
  mounts:          { "rock-grid": 1, "product-tile": 1 },
  networkCount:    3,
  networkFailures: 0
}
```

---

## Key design decisions

**One baseline per URL pathname.** Not per full URL (no query params, no hash). This is deliberate — you want the baseline for "/products" to apply regardless of which query params are active.

**Advisory, not authoritative.** The tool surfaces divergences for human review. It does not block anything, alert DevOps, or fail builds. It is a "something changed" signal, not a "this is broken" assertion.

**No auto-capture.** The user must explicitly click "Set as baseline." An auto-captured baseline (e.g., on first panel open) would be set at arbitrary points in the session and would be unreliable.

**localStorage only.** No server-side storage, no cross-user sync. The baseline lives in the browser that captured it. This is intentional — it is a personal debugging aid, not a team-level performance contract.

---

## Reliability

**Medium.** The render count and mount count are session measurements from the current page load. They vary by:
- **User workflow.** A user who opens 3 product detail dialogs records higher render counts than one who opens none. The baseline should be captured after a representative workflow.
- **Data volume.** A page with 48 products records 48 `<product-tile>` renders. A page with 200 products records 200. If the data volume changes, so do the baseline numbers.
- **Feature flags.** A/B tests or feature toggles that affect which components render will shift counts.

The divergence thresholds (+50% for warn, +200% for alert) are generous enough to absorb normal session variation. A +4% change (50 vs 48 renders) shows as OK.

**localStorage is not guaranteed.** In private browsing, blocked storage, or storage quota exceeded, the baseline silently fails to save/load. The panel renders correctly without it — the "Set as baseline" button appears and the divergence section is absent.

---

## Limitations

**Pathname-keyed only.** Pages that use hash routing or query-param-based routing (e.g., `/app#products` or `/app?view=products`) all map to the same pathname and share one baseline. This is a real limitation for SPAs with complex routing.

**No history.** Only one stored baseline per pathname. There is no "this week's baseline vs last week's" comparison. If you update the baseline, the previous one is gone.

**Render count is session-total, not per-page-view.** If you navigate to /products, away, and back in one session, `count` accumulates across both visits. Baseline and current comparison are both session totals, so this is consistent — but a baseline captured after 3 visits to the page won't match a current session with 1 visit.

**No Pinpoint integration.** Divergences are shown only in the Summary tab. They do not feed the Pinpoint issue list or the Fix Table export.

---

## What can improve

1. **Route-aware keying.** Support hash and query-param-based routes: `__lds_workflow_baseline_${pathname}_${hash}` for hash-routing apps.
2. **Named baselines.** Allow multiple named baselines per page ("before refactor", "after optimisation") with a dropdown selector.
3. **Pinpoint integration.** Surface large divergences as `excessive-renders` findings in Pinpoint with `evidenceLevel: "correlation"` and a `claudePrompt` pointing at the regressed component.
4. **Team sharing.** Export the baseline as a JSON file and import it into another browser session, so a team can share a canonical "healthy baseline" rather than each developer maintaining their own.
5. **Render-count-per-visit normalization.** Divide render counts by navigation cycle count (from `__LDS_MOUNT_CYCLES__`) to get a per-visit rate that's comparable across sessions with different numbers of page visits.

---

## How it makes life easier

- **Automatic regression detection.** The first person to open the panel after a regression sees `⚠ rock-grid renders: 174 (baseline: 12, +1350%)` without having to know what "normal" was — the tool remembers.
- **Catches what tests miss.** Functional tests verify correctness (right output given right input). They don't verify efficiency (right number of renders for that output). The baseline catches the gap.
- **Workflow-level, not just component-level.** The baseline captures a full session's render picture — not just one component. A regression that causes five components to re-render more appears as five divergences.

---

## What you'll see in the Summary tab

The Workflow Baseline section is in the **Summary tab**, collapsible:

```
▼ Workflow Baseline                                  ⚠ 1 alert

  Baseline captured: Oct 6, 12:00

  ⚠  rock-grid renders: 174   baseline: 12   +1350%   ← alert (red)
  ✓  product-tile renders: 50  baseline: 48   OK       ← fine (green)
  ⚠  rock-grid mounts: 3      baseline: 1    +200%    ← warn (amber)

  [📏 Set as baseline]   [Clear baseline]   [Update baseline]
```

- Red `⚠` = alert (+200% or more over baseline)
- Amber `⚠` = warn (+50–199% over baseline)
- Green `✓` = OK (within threshold)
- The section header shows a badge count of active alerts

**When no baseline is stored:**
```
▼ Workflow Baseline
  No baseline stored for this page.
  [📏 Set as baseline]
```

---

## Reading the results

| What you see | What it means |
|---|---|
| Alert on render count (+200%) | A regression introduced more renders — investigate with Perf tab and Prop Audit |
| Warn on mount count (+100%) | An element is mounting twice as often — may be a route change or component re-creation pattern |
| Network failure warning | New network errors appeared that weren't in the baseline |
| All OK but page feels slower | The baseline may be outdated — check Perf tab for absolute numbers |
| No divergences shown | Either no regression, or baseline was set after a session that was already anomalous |

---

## Step-by-step: detecting a regression across sessions

**Setting the baseline (do once on a healthy session):**
1. Go through a typical workflow on the page (open filters, scroll, view a few items)
2. Open panel → **Summary tab** → scroll to "Workflow Baseline" section
3. Click **📏 Set as baseline** — the current session's render and mount counts are stored
4. Session ends

**Detecting a regression (subsequent sessions):**
1. Open the same page → use the app normally
2. Open panel → **Summary tab** → Workflow Baseline section
3. Red/amber rows = regressions — the named components are rendering more than when you set the baseline
4. Navigate to Perf tab to see the absolute render counts; navigate to Pinpoint for `excessive-renders` findings

**After fixing a regression:**
1. Verify the fix reduced render counts (Perf tab)
2. Click **Update baseline** to store the new healthy numbers

---

## Sanity check

```js
// Check if a baseline exists for this page:
Object.keys(localStorage).filter(k => k.startsWith('__lds_workflow'))
// ['__lds_workflow_baseline_%2Fproducts'] → baseline exists for /products
// [] → no baseline stored

// Read the stored baseline:
JSON.parse(localStorage.getItem('__lds_workflow_baseline_' + encodeURIComponent(location.pathname)))
// null → no baseline for this pathname
```

---

## Complete example

```js
// 1. Go through a typical session on /products (open filters, scroll, view a few items)

// 2. Open panel → Summary tab → "Workflow Baseline" section
// → "No baseline stored for this page"
// → Click [📏 Set as baseline]

// 3. Session ends. Sometime later, a feature is deployed.

// 4. Next time you (or any team member) opens /products and opens the panel:
// ▼ Workflow Baseline
//   Baseline captured: Oct 6, 12:00
//   ⚠ rock-grid renders: 174 (baseline: 12, +1350%)   ← regression detected
//   ✓ product-tile renders: 50 (baseline: 48, OK)

// 5. Investigation: rock-grid is now rendering 14× more than baseline
// Open Perf tab → rock-grid count confirms the high number
// Open Pinpoint → check for related excessive-renders or prop-thrash findings

// 6. After fixing and re-deploying:
// Go through the typical workflow again
// Click [Update baseline] to record the new healthy numbers
```
