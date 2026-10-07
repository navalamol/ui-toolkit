# Phase 10 Handover — lit-debug-suite

This is a self-contained implementation brief for Phase 10. Read this file, then read the key source files listed below, and implement. No other context files are required.

---

## Project context

**Package name:** `lit-debug-suite`
**Location:** `D:\Work\R7\generic-changes\perf-tool\lit`
**Type:** Generic npm debug panel for LitElement apps, extracted from Syndigo's `ruf-debug-panel`. All Syndigo-specific code lives in `custom/ui-platform/` only. The core is framework-independent.

**Integrated into Syndigo app at:**
`D:\Work\2027.R1\NODE_UPGRADE_2026\2.upgrade_via_claude\ui-platform\node_modules\ui-platform-elements\lib\base\ruf-element.js`

**devaiwebtool Track-B reference (product philosophy):**
`D:\Work\R7\generic-changes\devaiwebtool\docs\CLAUDE-HANDIFF-00-MASTER-PRODUCT-BRIEF.md`

**Main source files:**

| File | Role |
|------|------|
| `src/core/gate.js` | Per-tool flag resolution (`_toolEnabled`, `_getDebugFlag`) |
| `src/core/memory.js` | Mount/unmount counters, cycle tracking, resource ledger |
| `src/core/perf.js` | TTI and render timing per component |
| `src/panel/LdsDebugPanel.js` | 12-tab debug panel (`<lds-debug-panel>`) — all UI |

---

## Phases 1–9 complete — what was built

**Phases 1–6:** 12 diagnostic tools, the floating 🐞 panel, Fix Table export with `claudePrompt` string, history/diff tab, vitals, network, events.

**Phase 7:** Evidence Ladder (5 levels: `observation` < `correlation` < `attribution` < `lifetime-violation` < `causality-confirmed`). Every issue in `_buildPinpointIssues()` carries `evidenceLevel` and `observed` fields. Fix Table now exports `evidenceCapsule` (structured JSON with `claudePrompt` preserved inside for backwards compat). Slope-based progressive-leak detection using `window.__LDS_MOUNT_CYCLES__` (populated on `visibilitychange`).

**Phase 8:** Verification loop. `_captureBaseline()` saves per-component metrics to `localStorage` under key `__lds_baseline`. "▶ Replay to verify fix" button per Pinpoint issue. `_buildComparison(issue, endSnap)` computes before/after delta. ≥70% improvement on primary metric = `✅ VERIFIED` badge, evidence level upgrades to `causality-confirmed`. `evidenceCapsule.verification` field populated in Fix Table export. State is session-only except the baseline.

**Phase 9:** `ResourceLedger` in `memory.js`. Per-element and global (`window`/`document`) `addEventListener` patching. `_currentOwner` set to the connecting element during `connectedCallback`, cleared via `queueMicrotask` after sync call completes (so global listeners called synchronously in connectedCallback are attributed to the element). `lifetime-violation` evidence level. `resource-outlived-owner` finding type in Pinpoint. Exposed as `window.__LDS_RESOURCE_VIOLATIONS__`. Suppression list via `window.__LDS_SUPPRESS_EVENTS__`. Gate flag: `window.__LDS_RESOURCE_TRACKER__`.

**gate.js bug was fixed:** Stray live assignment statements that force-enabled all tools on every `_toolEnabled()` call were removed. The function now works correctly.

---

## Key technical state to be aware of

- `_toolEnabled(toolKey)` in `gate.js` is the correct way to guard new features. Call it with a new key string and add the matching per-tool flag in the header comment.
- `memory.js` imports `_toolEnabled` from `./gate.js`.
- `LdsDebugPanel.js` collects data in `_collectReport()` (reads window globals), builds issues in `_buildPinpointIssues(report)`, renders in `_renderPinpoint()` and `_renderIssueCard(issue)`.
- `_exportFixTable()` builds the JSON array of `evidenceCapsule` objects.
- Phase 8 baseline key in localStorage: `__lds_baseline` — **do not use this key for Phase 10**. See below.
- The panel is a native custom element (not Lit). It uses `this.shadowRoot.innerHTML` style rendering and manual event delegation.

---

## Phase 10 spec

### Goal

Remember what "normal" looks like for each page/workflow so that regressions in render count, mount frequency, or network behavior are detected automatically the next time the panel opens — not by a human comparing two sessions.

### Features

**1. Workflow baseline save**

"Set as baseline" button in the Summary tab. Captures current session metrics and stores them in `localStorage` keyed by page URL.

Storage key pattern: `__lds_workflow_baseline_${encodeURIComponent(location.pathname)}`

**This is distinct from the Phase 8 baseline** (`__lds_baseline`). Do not merge them:
- Phase 8 baseline: manually captured per-investigation, used to verify a specific fix. Ephemeral by design.
- Phase 10 baseline: workflow-level, captures "normal" for the page, used for regression detection across sessions.

What to store:
```json
{
  "url": "https://app.example.com/products",
  "capturedAt": "2026-10-06T12:00:00.000Z",
  "renders": { "rock-grid": 12, "product-tile": 48 },
  "mounts": { "rock-grid": 1, "product-tile": 1 },
  "networkCount": 3,
  "networkFailures": 0
}
```

Source data:
- `renders` and per-component render counts: from `window.__LDS_PERF__` — each entry has `{ totalMs, count, ... }`; use `.count` as the render count per tag.
- `mounts`: from `window.__LDS_MEMORY__` — `{ mounted, unmounted, gcCount }` per tag; use `.mounted`.
- `networkCount` and `networkFailures`: from `window.__LDS_NETWORK_LOG__`.

**2. Divergence detection**

On each subsequent page load (when the panel opens and a baseline exists for this URL), compare current metrics to the stored baseline and surface divergences in the Summary tab.

Divergence thresholds:
- Render count per tag: **warn** at +50%, **alert** at +200%
- Mount count per tag: **warn** at +100% (doubled)
- Network failures: **warn** if current > baseline (any new failures)

Surface as a collapsible "Baseline" section in Summary tab:
```
⚠ rock-grid renders: 174 (baseline: 12, +1350%)
⚠ resize listeners:  +1/open-close cycle (baseline: 0)
ℹ product-tile renders: 50 (baseline: 48, +4% — OK)
```

Suppress tags with <5 renders in both baseline and current (noise filter).

**3. Advisory, not authoritative**

- If no baseline exists for this URL: no divergence section, just the "Set as baseline" button.
- Baseline can be cleared with a "Clear baseline" button.
- Do not build historical tracking, trend charts, or multi-session aggregation. One stored baseline per URL.
- If `localStorage` is unavailable (private mode, blocked storage, quota exceeded): catch the error and silently skip. The panel must render correctly without it.

### UI placement

Add to the **Summary tab** (`_renderSummary()` in `LdsDebugPanel.js`):

```
┌─────────────────────────────────────────────────────────────┐
│ ▼ Workflow Baseline                                         │
│                                                             │
│ [No baseline stored for this page]                          │
│ [📏 Set as baseline]                                        │
│                                                             │
│  — or, when baseline exists: —                              │
│                                                             │
│ Baseline captured: 2026-10-06 12:00                         │
│ ⚠ rock-grid renders: 174 (baseline: 12, +1350%)            │
│ ✓ product-tile renders: 50 (baseline: 48, OK)               │
│ [Clear baseline]                                            │
└─────────────────────────────────────────────────────────────┘
```

### Files to touch

| File | What to add |
|------|-------------|
| `src/panel/LdsDebugPanel.js` | `_captureWorkflowBaseline()`, `_clearWorkflowBaseline()`, `_loadWorkflowBaseline()`, `_buildWorkflowDivergences(baseline, report)`, update `_renderSummary()` |
| `src/core/perf.js` | Verify render counts are accessible from `window.__LDS_PERF__` (read-only, no change needed unless the shape is wrong) |
| `src/core/memory.js` | Verify mount counts are accessible from `window.__LDS_MEMORY__` (read-only, no change likely needed) |

### New gate flag

Add to `gate.js` header comment and `_toolEnabled`:
```js
// window.__LDS_WORKFLOW_BASELINE__ = true   // Phase 10 workflow baseline tracking
if (toolKey === 'workflowBaseline' && window.__LDS_WORKFLOW_BASELINE__) return true;
```

But the "Set as baseline" button and divergence display in Summary can be **always-on** (no gate) — they read from localStorage, which is harmless when empty. The gate is only needed if reading `__LDS_PERF__` or `__LDS_MEMORY__` at panel-open time has overhead.

### Kill test

Phase 10 earns its place if it catches a regression that passed functional tests. Concretely: if `rock-grid` renders 174 times on a page where 12 was the baseline, and the test suite didn't flag it (because rendering the right output ≠ rendering efficiently), Phase 10 surfaces it. If this scenario is common in your app, the phase is worth it. If every render regression is caught by the test suite anyway, skip it.

---

## Decision framework (from ROADMAP.md)

At every design decision in Phase 10, ask:
- Is this runtime fact deterministic, or is it model inference dressed up as data?
- Does this shorten the investigation compared to DevTools alone — or just add another screen?
- Can we express this as a compact evidence artifact instead of a UI widget?
- What is the kill test for this specific feature?

---

## Reading the existing code before starting

Read these before writing any Phase 10 code:

1. `src/panel/LdsDebugPanel.js` — find `_renderSummary()`, `_collectReport()`, `_captureBaseline()` (Phase 8, for contrast), and `constructor()`
2. `src/core/perf.js` — confirm shape of `window.__LDS_PERF__`
3. `src/core/gate.js` — understand the flag pattern before adding `workflowBaseline`

Do not read `memory.js` or `LdsDebugPanel.js` in full — they are long. Use grep to find the specific function you need.

---

## What NOT to build

- Do not build historical trend charts (multiple baselines per URL)
- Do not build cross-browser or cross-user baseline sync
- Do not merge Phase 10 baseline with Phase 8 baseline — different keys, different purposes
- Do not add divergence alerts to the Pinpoint tab — Summary tab only
- Do not auto-capture baseline without the user clicking "Set as baseline"
