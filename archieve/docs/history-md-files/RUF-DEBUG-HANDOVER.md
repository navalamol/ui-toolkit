# RUF Debug Suite — Session Handover

## What this is

A zero-overhead, tenant-activatable debug and diagnostics suite embedded in `ui-platform-elements`. When a customer or QA environment reports a performance, crash, or data flow issue, support sets a single flag in tenant `globalSettings`. The customer browses normally, then downloads a self-contained JSON report from a floating debug panel. Support gets full context with zero customer involvement beyond clicking "Download Report".

---

## Repo locations

| Repo | Path | Branch |
|---|---|---|
| Library | `D:\Work\R7\generic-changes\ui-platform-elements` | `tier-1` |
| Platform | `D:\Work\R7\SUPER_LOGS\ui-platform` | (check branch) |

---

## Files created / modified this session

### New files — `ui-platform-elements/src/base/`

| File | Purpose |
|---|---|
| `ruf-error-boundary.js` | Wraps `performUpdate` / `_propertiesChanged` in try/catch; logs to `window.__RUF_ERRORS__`; injects fallback UI on crash |
| `ruf-perf.js` | TTI (time-to-interactive) tracker per component tag; stores in `window.__RUF_PERF__` |
| `ruf-prop-audit.js` | Traces property changes per element; activated by `window.__RUF_PROP_DEBUG__` |
| `ruf-inspector.js` | Hover-badge snapshot of component state; activated by `window.__RUF_INSPECTOR__` |
| `ruf-memory.js` | Mount/unmount lifecycle counters via `FinalizationRegistry`; stores in `window.__RUF_MEMORY__` (Map) |
| `ruf-aci-tracer.js` | Patches `aci.dispatch` once to record action timeline in `window.__RUF_ACI_TIMELINE__` |
| `ruf-slow-api.js` | Patches `DataObjectManager` to log calls exceeding threshold into `window.__RUF_SLOW_API_LOG__` |
| `ruf-console.js` | Patches `console.error` / `console.warn` into 200-entry ring buffer at `window.__RUF_CONSOLE__` |
| `ruf-debug-panel.js` | `<ruf-debug-panel>` LitElement — floating 🐞 trigger + 8-tab slide-in panel + JSON report download |

### Modified files — `ui-platform-elements/src/base/`

**`ruf-element.js`** — the base mixin for all 86 elements:
- Imports all 8 tool modules (static imports — parsed once, zero per-element cost without flag)
- `_getDebugFlag()` — reads `window.__RUF_DEBUG__` → `mainApp.globalSettings.rufDebugEnabled` → `false`
- `_toolEnabled(toolKey)` — per-tool backward-compat flags + master flag resolution
- `connectedCallback` — all 8 `attach()` calls are gated; forward-sets per-tool flags when master flag enables them
- `disconnectedCallback` — unconditional detach (safe on un-attached elements)

**`ruf-prop-audit.js`** — added early-exit guard in `attach()` when `__RUF_PROP_DEBUG__` is not set

### Modified files — `ui-platform/src/elements/`

| File | Change |
|---|---|
| `app-main/main-app.js` | Import `ruf-debug-panel.js`; add `<ruf-debug-panel>` inside `readyForLoad` template gated on `[[globalSettings.rufDebugEnabled]]` |
| `app-main-v2/main-app-v2.js` | Same for Lit: `this.globalSettings?.rufDebugEnabled ? html\`<ruf-debug-panel>\` : html\`\`` |

---

## Architecture — the core design

### Zero-overhead guarantee
Static imports parse the modules once at app load (negligible). Per-element cost when no flag is set:
- 8 × `_toolEnabled()` = ~40 property reads per `connectedCallback` (~100–300 ns). Unmeasurable.
- No closures, no listeners, no method patches allocated.

### Master flag + per-tool backward compat

```js
// Enable everything (most common — support/QA)
window.__RUF_DEBUG__ = true

// Selective tools only
window.__RUF_DEBUG__ = { perf: true, slowApi: true, console: true }

// Tenant config (support sets — no console access needed)
mainApp.globalSettings.rufDebugEnabled = true
mainApp.globalSettings.rufDebugEnabled = { aciTracer: true, memory: true }

// Per-tool standalone flags (existing workflows still work)
window.__RUF_PERF_ENABLED__ = true
window.__RUF_PROP_DEBUG__   = '*'              // all components
window.__RUF_PROP_DEBUG__   = 'rock-grid'      // targeted
window.__RUF_INSPECTOR__    = true
window.__RUF_ACI_TRACE__    = true
window.__RUF_SLOW_API__     = true
window.__RUF_CONSOLE_ENABLED__ = true
```

**Valid `toolKey` values:** `errorBoundary`, `perf`, `propAudit`, `inspector`, `memory`, `aciTracer`, `slowApi`, `console`

### Panel activation
`<ruf-debug-panel>` is only ever in the DOM when `globalSettings.rufDebugEnabled` is truthy. Not in DOM = zero cost. The element itself extends plain `LitElement` (not `RufElement`) to avoid recursive instrumentation.

### Why disconnectedCallback is unconditional
If `__RUF_DEBUG__` is disabled after mount, a symmetric gate would strand listeners/wrappers permanently. Unconditional detach is safe — all `detach()` implementations guard on a marker property and are no-ops on un-instrumented elements.

---

## Panel UI — `<ruf-debug-panel>`

| Tab | Data source | Shows |
|---|---|---|
| Summary | All tools | Anomaly findings (🔴🟠🟡✅), quick stat chips, environment snapshot |
| Perf | `window.__RUF_PERF__` | TTI table sorted by avg ms; slow rows highlighted in red |
| Errors | `window.__RUF_ERRORS__` | Crash log: tag, phase, message, timestamp |
| Console | `window.__RUF_CONSOLE__` | error/warn entries with level badge |
| ACI | `window.__RUF_ACI_TIMELINE__` | Action sequence, relative timing |
| Slow API | `window.__RUF_SLOW_API_LOG__` | DataObjectManager calls over threshold |
| Memory | `window.__RUF_MEMORY__` (Map) | Mount/unmount/alive per tag; high-mount rows flagged |
| Env | Captured live | Browser, CPU cores, device RAM, JS heap, network, page load timing |

**⬇ Report** button downloads `ruf-report-<timestamp>.json` with all data + environment.

### Anomaly detection (Summary tab)
- 🔴 `CRITICAL` — ErrorBoundary caught crashes
- 🟠 `HIGH` — Slow API calls exceeded threshold / render storm (>50 mounts)
- 🟡 `MEDIUM` — Component avg TTI > 500ms / console errors
- ✅ `OK` — No anomalies

---

## Known limitations

1. **Already-mounted elements** — setting the flag after page load does not retroactively instrument mounted elements. Trigger remounts (route change, dialog open/close) or full reload.
2. **`deviceMemory` / JS heap / network info** — Chrome-only. Shown as "unavailable" on Firefox/Safari.
3. **`performance.measureUserAgentSpecificMemory()`** — more precise heap data, requires `COOP`/`COEP` headers (infra concern for `ui-platform`, not this library).
4. **Console capture only patches `error` and `warn`** — `console.log` traffic excluded to keep buffer lean.

---

## Round 3 — Completed

### R3-A — Large DOM detector
`_collectReport()` now captures `domStats = { totalNodes, customElements: { [tag]: count } }`. Summary chip amber >1500. Health score deductions −5/>1500, −10/>2500, −20/>5000. HTML export adds "DOM Size" section.

### R3-B — History diff
History rows now have checkboxes (max 2). "Compare N" button appears when exactly 2 selected. `_buildDiff(a, b)` computes metrics table (health score, crashes, storms, network failures, avg TTI, DOM nodes) plus new/fixed issues and new/removed component tags. `_renderDiff()` shows the comparison. Back button returns to list.

### R3-D — Auto-POST on crash
`ruf-error-boundary.js`: `_tryAutoPost(entry)` reads `globalSettings.rufCrashEndpoint` + `rufCrashAutoPost`; POSTs crash JSON once per page load; `_showCrashBanner()` shows fixed-position green banner.

### Network tab — Falcor row expansion
Network rows are click-to-expand. `_renderNetExpand(n)` shows full Falcor decoded data: callPath, path segments, entity types, pagination, sort, valueContexts, extra filters — plus full URL, duration, response size.

---

## Phase 4 — optional enhancements

- **Session replay sketch** — ACI timeline + component mount sequence gives a "what did the user do" narrative without screen recording
- **Heap snapshot delta** — capture `performance.memory` before/after a user action to surface memory leaks
- **Network failure capture** — extend `ruf-slow-api.js` to also log `fetch` errors (not just slow calls)
- **Auto-report on crash** — when `RufErrorBoundary` catches a crash, optionally auto-POST the report to a support endpoint (requires endpoint config in globalSettings)

---

## Phase 2.5 — Completed this session

### Import + History
- `window.__RUF_HISTORY__` = array (max 20) of `{ id, capturedAt, source, sessionId, report }`
- Every `↻ Refresh` and `⬇ Report` auto-saves a snapshot to history
- `📥 Import` button opens a file picker — loads a customer-sent JSON report into history and switches to it
- Mode indicator in header: `📥 IMPORTED` (blue) or `📋 HISTORY` (purple) badge
- `↩ Live` button reverts to live data
- **📋 History tab** — lists all snapshots (time, source pill, session tail, issue count preview); click `View` to load any

### Pinpoint + Fix Table
- `ruf-perf.js` — slow renders (>500ms) now push `{ tag, ms, ts, stack }` to `window.__RUF_SLOW_RENDERS__`
- `ruf-memory.js` — when a component crosses 20 mounts, pushes `{ tag, count, ts, stack }` to `window.__RUF_STORMS__`
- `_collectReport()` includes `slowRenders` and `storms` fields
- **🔍 Pinpoint tab** — aggregates all issues (crashes, storms, slow renders, high-avg TTI, memory leaks), each with:
  - Derived file path: `src/elements/<tag>/<tag>.js`
  - Details paragraph
  - 💡 Fix recommendation
  - Expandable call stacks (captured at runtime by perf/memory tools)
- **Export Fix Table** button downloads `ruf-fix-table-<ts>.json` — structured array:
  ```json
  [{ "id", "component", "filePath", "issueType", "severity", "details", "callStack", "recommendation", "reportedAt", "sessionId" }]
  ```
  Feed this JSON to Claude with: "Fix the issues in this fix table" — Claude can scan `filePath` and apply targeted fixes.

---

## Quick git status at end of session

Modified/staged in `ui-platform-elements` on branch `tier-1`:
```
A  src/base/ruf-aci-tracer.js       ← R2-C: __RUF_ACI_FREQ__ frequency table + source map
A  src/base/ruf-console.js
A  src/base/ruf-debug-panel.js      ← v4: R2 causality layer UI (render reasons, thrash, ACI freq, cycles, Falcor network)
A  src/base/ruf-inspector.js
A  src/base/ruf-memory.js
MM src/base/ruf-element.js          ← +cycleDetector import + wiring
A  src/base/ruf-perf.js
A  src/base/ruf-prop-audit.js       ← R2-A: __RUF_RENDER_REASONS__ + R2-B: __RUF_THRASH__
A  src/base/ruf-slow-api.js
A  src/base/ruf-vitals.js
A  src/base/ruf-network.js          ← Falcor body parsing: callPath, operation, domain, types
A  src/base/ruf-cycle-detector.js   ← NEW R2-D: cross-element cycle detection → __RUF_CYCLES__
```

Modified in `ui-platform`:
```
M  src/elements/app-main/main-app.js        ← panel wired
M  src/elements/app-main-v2/main-app-v2.js  ← panel wired
```

---

## New MD files

| File | Purpose |
|---|---|
| `RUF-MISSIONS.md` | Complete record of all phases delivered — what each file does, globals table, activation reference |
| `RUF-ROADMAP.md` | Prioritised next rounds (R2 causality, R3 DOM/diff, R4 Claude auto-fix), idea backlog, observation backlog |

---

## How to start the new session

1. Open `D:\Work\R7\generic-changes\ui-platform-elements` in Claude Code
2. Read `RUF-DEBUG-HANDOVER.md` for repo locations and git state
3. Read `RUF-MISSIONS.md` for the complete delivered state
4. Read `RUF-ROADMAP.md` to pick what to build next
5. Add extra requirements in the section above before starting
