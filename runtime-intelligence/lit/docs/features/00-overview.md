# lit-debug-suite — Feature Overview

**Package:** `lit-debug-suite`  
**Type:** Zero-overhead runtime debug panel for LitElement apps  
**Installation:** Drop `<lds-debug-panel>` into your app shell. Add `LitDebugMixin` to your base element class.

---

## What this suite is

`lit-debug-suite` is 12 independent diagnostic tools that all activate at runtime through `window` flags — no build step, no code changes to your components, zero overhead when off. Each tool collects data into a `window.__LDS_*` global. A floating 🐞 panel reads those globals and presents them in a 12-tab UI.

You can use any combination of tools independently. Enabling one does not enable others.

---

## The master flag

```js
// All 12 tools at once
window.__LDS_DEBUG__ = true;

// Selective — only the tools you want
window.__LDS_DEBUG__ = {
  perf: true,
  network: true,
  resourceTracker: true,
};

// App-level config (read once at boot)
window.__LDS_APP_CONFIG__ = { debugEnabled: true };
```

The master flag is checked by `gate.js`. Each per-tool standalone flag (below) works **without** the master flag — you can enable any single tool on its own.

---

## The 12 tools at a glance

| # | Flag | Source file | What it does | Panel tab |
|---|------|-------------|--------------|-----------|
| 1 | `__LDS_PERF_ENABLED__` | `perf.js` | TTI (time-to-interactive) per component | Perf |
| 2 | `__LDS_PROP_DEBUG__` | `prop-audit.js` | Render reasons + property thrash detection | — (console + Pinpoint) |
| 3 | `__LDS_INSPECTOR__` | `inspector.js` | Hover badge → full component snapshot | — (clipboard) |
| 4 | `__LDS_EVENTS_TRACE__` | `event-tracer.js` | Custom event bus timeline + frequency table | Events |
| 5 | `__LDS_SLOW_API__` | `slow-api.js` | Slow API method detection + visual badge | SlowAPI |
| 6 | `__LDS_CONSOLE_ENABLED__` | `console.js` | `console.error` / `console.warn` ring buffer | Console |
| 7 | `__LDS_VITALS_ENABLED__` | `vitals.js` | LCP, CLS, INP, Long Tasks | Vitals |
| 8 | `__LDS_NETWORK_ENABLED__` | `network.js` | fetch + XHR intercept; slow/large/error detection | Network |
| 9 | `__LDS_CYCLE_DETECT__` | `cycle-detector.js` | Circular property-update chain detection | — (Pinpoint) |
| 10 | `__LDS_RESOURCE_TRACKER__` | `memory.js` | Event listener lifetime — detects leaks on disconnect | — (Pinpoint) |
| 11 | `__LDS_WORKFLOW_BASELINE__` | `LdsDebugPanel.js` | Workflow baseline — regression detection across sessions | Summary |
| 12 | *(always on)* | `memory.js` | Mount/unmount counters, GC tracking, storm detection | Memory |

> Tool 12 (memory counters) is always active when the mixin is installed. No flag required.

### Syndigo extension: Falcor tab

The **Falcor tab** is a Syndigo-specific extension (not part of the generic core). It reads from the same `__LDS_NETWORK_LOG__` as the Network tab but adds Falcor-specific decoding: path anatomy, burst grouping, dataIndex breakdown, duplicate detection, and search session linking.

| Flag | Source | What it does | Panel tab |
|------|--------|--------------|-----------|
| `__LDS_FALCOR_VIEW__` (+ `__LDS_NETWORK_ENABLED__`) | `custom/ui-platform/FalcorDecoder.js` | Falcor call grouping, path anatomy, duplicate detection | **Falcor** |

See [15 — Falcor Tab](15-falcor-tab.md) for full documentation.

---

## The panel

The 🐞 badge appears in the bottom-right corner when `<lds-debug-panel>` is registered.  
Click it to open the slide-in panel with 12 tabs:

```
Summary · Pinpoint · Vitals · Network · Falcor · Perf · Errors · Console · Events · SlowAPI · Memory · History · Env
```

**Key panel actions:**
- **Refresh** — captures a fresh snapshot of all `window.__LDS_*` globals
- **Download JSON** — exports the complete report as a file
- **Import** — loads a previously exported report (great for async sharing)
- **Export Fix Table** (Pinpoint tab) — structured JSON array with `evidenceCapsule` per finding

### Panel tab → tool mapping

| Tab | Fed by | Notes |
|-----|--------|-------|
| Summary | All tools | Health score, stat chips, Workflow Baseline section |
| Pinpoint | Perf, PropAudit, CycleDetector, ResourceTracker, Memory | Aggregated findings — start here |
| Vitals | vitals.js | LCP, CLS, INP, Long Tasks |
| Network | network.js | fetch + XHR log |
| Falcor | network.js + FalcorDecoder | Falcor-specific: burst groups, path anatomy, dataIndex breakdown, search sessions |
| Perf | perf.js | TTI per component |
| Errors | LdsErrorBoundary | Structured crash reports |
| Console | console.js | `console.error` / `console.warn` ring buffer |
| Events | event-tracer.js | Custom event bus timeline + frequency |
| SlowAPI | slow-api.js | API method timing |
| Memory | memory.js | Mount/unmount/active/GC counts |
| History | — | Export / Import session reports |
| Env | — | Snapshot of all `window.__LDS_*` globals |

> **Tools without a dedicated tab:** Prop Audit (02), Component Inspector (03), Cycle Detector (09), and Resource Tracker (10) write to the **Pinpoint tab** and/or the browser console. See each tool's doc for where to find their output.

---

## The Fix Table and evidenceCapsule

When you export from the Pinpoint tab, you get an array of issue objects. Each has an `evidenceCapsule` field:

```js
// One item in the Fix Table export array
{
  id:                "...",
  component:         "rock-grid",
  filePath:          "src/elements/rock-grid/rock-grid.js",
  issueType:         "memory-leak",
  severity:          "HIGH",
  details:           "...",
  recommendation:    "...",
  lineNumber:        184,
  readHint:          "Read src/elements/rock-grid/rock-grid.js lines 174 to 194",
  relatedComponents: ["product-tile"],
  evidenceCapsule: {
    problem:          "memory-leak",
    component:        "rock-grid",
    file:             "src/elements/rock-grid/rock-grid.js",
    line:             184,
    evidenceLevel:    "correlation",
    observed:         { mounted: 47, unmounted: 4, active: 43, leakType: "progressive-leak" },
    callStack:        ["rock-grid.js:184", "..."],
    recommendation:   "Check disconnectedCallback...",
    relatedComponents: ["product-tile"],
    claudePrompt:     "Fix a HIGH memory-leak issue in <rock-grid>...",  // ← preserved for backwards compat
    verification:     null   // filled after Phase 8 verification
  },
  filteredCallStack: "...",
  callStack:         "...",
  reportedAt:        "2026-10-06T10:00:00.000Z",
  sessionId:         "..."
}
```

`claudePrompt` is a flat string preserved **inside** `evidenceCapsule` for backwards compatibility with any script that reads it directly. New integrations should read `evidenceCapsule` as the structured source of truth.

---

## Evidence levels (Phase 7)

Every Pinpoint finding has an `evidenceLevel`:

| Level | Meaning | Confidence |
|-------|---------|------------|
| `observation` | Something was measured; cause unknown | Low — investigate before acting |
| `correlation` | Multiple signals point the same direction | Medium — strong enough to file a bug |
| `attribution` | Source file + line confirmed from call stack | High — act on this directly |
| `lifetime-violation` | Listener deterministically survived owner disconnect | Definite — always fix |
| `causality-confirmed` | Phase 8 verification proved the fix worked | Proven |

---

## Memory and lifecycle

Each element that uses `LitDebugMixin` is tracked through:
- `connectedCallback` → all attach functions called (perf, propAudit, inspector, cycleDetector, slowApi, resourceTracker)
- `disconnectedCallback` → resource tracker checks for unreleased listeners, all detach functions called
- `FinalizationRegistry` → detects when a disconnected element is GC'd (increments `gcCount`)

---

## Getting started

- [Quick Start](00b-quick-start.md) — from zero to first insight in 5 minutes
- [Tool by Symptom](13-tool-by-symptom.md) — know the problem, not the tool? Start here
- [Pinpoint Tab Guide](00c-pinpoint-tab.md) — how findings work, evidence levels, Fix Table export
- [Troubleshooting](14-troubleshooting.md) — nothing showing? Common causes and fixes

## Feature docs

- [01 — Performance Monitor](01-perf-monitor.md) `__LDS_PERF_ENABLED__`
- [02 — Prop Audit](02-prop-audit.md) `__LDS_PROP_DEBUG__` *(no panel tab — console + Pinpoint)*
- [03 — Component Inspector](03-inspector.md) `__LDS_INSPECTOR__` *(no panel tab — clipboard)*
- [04 — Event Tracer](04-event-tracer.md) `__LDS_EVENTS_TRACE__`
- [05 — Slow API Monitor](05-slow-api.md) `__LDS_SLOW_API__`
- [06 — Console Capture](06-console.md) `__LDS_CONSOLE_ENABLED__`
- [07 — Web Vitals](07-vitals.md) `__LDS_VITALS_ENABLED__`
- [08 — Network Monitor](08-network.md) `__LDS_NETWORK_ENABLED__`
- [09 — Cycle Detector](09-cycle-detector.md) `__LDS_CYCLE_DETECT__` *(no panel tab — Pinpoint)*
- [10 — Resource Tracker](10-resource-tracker.md) `__LDS_RESOURCE_TRACKER__` *(no panel tab — Pinpoint)*
- [11 — Workflow Baseline](11-workflow-baseline.md) `__LDS_WORKFLOW_BASELINE__`
- [12 — Memory Counters](12-memory-counters.md) *(always on)*
- [15 — Falcor Tab](15-falcor-tab.md) `__LDS_FALCOR_VIEW__` *(Syndigo extension — requires `__LDS_NETWORK_ENABLED__`)*
