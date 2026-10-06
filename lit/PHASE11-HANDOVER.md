# Phase 11 Handover — lit-debug-suite

Self-contained brief. Read this, then the files listed below, and continue.

---

## What was done this session

**Phase 10 implemented** in `src/panel/LdsDebugPanel.js` and `src/core/gate.js`:
- `_workflowBaselineKey()`, `_loadWorkflowBaseline()`, `_captureWorkflowBaseline()`, `_clearWorkflowBaseline()`, `_buildWorkflowDivergences()`, `_renderWorkflowBaseline()` — all in LdsDebugPanel.js
- Gate flag `workflowBaseline` added to gate.js (comment + `_toolEnabled` entry)
- `_workflowBaseline` and `_baselineOpen` state added to constructor
- `_renderWorkflowBaseline(r)` called at end of `_renderSummary()`
- localStorage key: `__lds_workflow_baseline_${encodeURIComponent(location.pathname)}`
- Divergence thresholds: renders +50% = warn, +200% = alert; mounts +100% = warn; any new network failures = warn
- Noise filter: tags with <5 renders in both baseline and current are skipped
- Summary tab shows collapsible "Workflow Baseline" section with Set/Clear/Update buttons

**Documentation suite created** in `docs/features/` — 13 markdown files:
- `00-overview.md` — master index, Fix Table shape, evidence levels
- `01-perf-monitor.md` through `12-memory-counters.md` — one file per flag/feature

All docs are sourced directly from the code (read every source file this session). They are accurate as of this session.

---

## Current git state

Branch: `main` — clean after the b7c577d commit (Phases 7-9 + docs).  
Phase 10 code changes are **uncommitted**. The docs/ folder is **new and uncommitted**.

Files changed/added this session:
- `src/panel/LdsDebugPanel.js` — Phase 10 methods + constructor state + _renderSummary update
- `src/core/gate.js` — workflowBaseline flag
- `docs/features/00-overview.md` through `12-memory-counters.md` — NEW

---

## Next task: review docs → single HTML artifact

The user reviewed the docs structure and confirmed it looks correct. The plan:

1. **User reviews** `docs/features/*.md` files and marks up what to change (tone, gaps, corrections)
2. Once content is confirmed, **compile all 13 files into one HTML artifact** — multi-tab layout, one tab per feature, with visual diagrams

### HTML artifact notes (from earlier attempt)
An earlier HTML for `01-perf-monitor.md` was published at `https://claude.ai/artifact/HHsgUaNgvXND4ipdQD72i5` — the user stopped it to do all features first. That artifact's design (IBM Plex Sans/Mono, dark-first, amber accent, sticky sidebar) was approved. Use it as the template for the final multi-tab HTML.

The final HTML artifact should be one page with:
- Tab bar for all 12 features + overview
- Sidebar nav within each tab for section anchors
- Consistent design across all tabs
- SVG/ASCII diagrams as in the earlier artifact
- Dark-first, both themes supported

---

## Key technical facts (do not look up again)

### Fix Table export shape
Each item in the exported array has:
- Top-level fields: `id, component, filePath, issueType, severity, details, recommendation, lineNumber, readHint, relatedComponents, filteredCallStack, callStack, reportedAt, sessionId`
- `evidenceCapsule` object: `{ problem, component, file, line, evidenceLevel, observed, callStack, recommendation, relatedComponents, claudePrompt, verification }`
- `claudePrompt` lives INSIDE `evidenceCapsule` (backwards compat). It is NOT a top-level field.

### window globals summary
| Global | Source | Shape |
|--------|--------|-------|
| `__LDS_PERF__` | perf.js | `{ [tag]: { count, totalMs, maxMs, minMs, samples[] } }` — avgMs derived |
| `__LDS_SLOW_RENDERS__` | perf.js | `[{ tag, ms, ts, stack }]` cap 100 |
| `__LDS_RENDER_REASONS__` | prop-audit.js | `{ [tag]: [{ prop, oldSummary, newSummary, sameRef, ts }] }` cap 50/tag |
| `__LDS_THRASH__` | prop-audit.js | `[{ tag, prop, count, windowMs, ts, stack }]` cap 200 |
| `__LDS_EVENTS_TIMELINE__` | event-tracer.js | `[{ seq, ts, elapsed, name, from, detail, detailSummary }]` cap 500 |
| `__LDS_EVENTS_FREQ__` | event-tracer.js | `{ [name]: { count, sources[] } }` |
| `__LDS_SLOW_API_LOG__` | slow-api.js | `[{ ts, ms, method, tag, operation, request, response, status }]` cap 100 |
| `__LDS_CONSOLE__` | console.js | `[{ level, message, ts }]` cap 200 |
| `__LDS_VITALS__` | vitals.js | `{ lcp, cls, inp, longTasks[] }` |
| `__LDS_NETWORK_LOG__` | network.js | `[{ url, fullUrl, method, status, durationMs, responseSizeKB, ts, isError, isSlow, isLarge, type, decoded, error? }]` cap 200 |
| `__LDS_CYCLES__` | cycle-detector.js | `[{ path, count, prop, ts, stack }]` cap 100 |
| `__LDS_MEMORY__` | memory.js | `Map<tag, { mounted, unmounted, gcCount }>` |
| `__LDS_STORMS__` | memory.js | `[{ tag, count, ts, stack }]` |
| `__LDS_MOUNT_CYCLES__` | memory.js | `[{ cycleId, startTs, endTs, counts }]` cap 10 |
| `__LDS_RESOURCE_VIOLATIONS__` | memory.js | `[{ ownerId, ownerTag, instanceNum, resources[], detectedAt }]` |

### Hard-coded thresholds (cannot be configured today)
- Perf slow render: 500ms
- Network slow: 2000ms, large: 512KB
- Memory storm: >20 mounts
- Event frequency high flag: >20 count
- Slow API default threshold: 2000ms (configurable via `__LDS_SLOW_API_MS__`)
- Thrash default: 5 writes/1000ms (configurable via `__LDS_THRASH_THRESHOLD__`)

### Source file locations
```
src/core/gate.js           — flag resolution
src/core/memory.js         — counters + resource tracker (Phase 9)
src/core/perf.js           — TTI measurement
src/core/prop-audit.js     — render reasons + thrash
src/core/inspector.js      — hover snapshot
src/core/event-tracer.js   — event bus timeline
src/core/slow-api.js       — API method timing + badge
src/core/console.js        — console.error/warn capture
src/core/vitals.js         — LCP/CLS/INP/LongTasks
src/core/network.js        — fetch + XHR intercept
src/core/cycle-detector.js — directed graph DFS
src/panel/LdsDebugPanel.js — 12-tab panel (~1500 lines) including Phase 10
```

### Existing published HTML artifact
URL: `https://claude.ai/artifact/HHsgUaNgvXND4ipdQD72i5`  
Content: Deep-dive for `__LDS_PERF_ENABLED__` only. Approved design. NOT updated to reflect this session's content — it is the prototype only.

---

## Memory file to update

Update `C:\Users\AmolSurendraNaval\.claude\projects\D--Work-R7-generic-changes-perf-tool\memory\project-lit-debug-suite.md`:
- Phase 10 is complete (workflow baseline)
- docs/features/ suite created (13 .md files)
- Next: user review of docs → single multi-tab HTML artifact

---

## Immediate next steps for new session

1. Read this file
2. Read `docs/features/00-overview.md` for the full feature map
3. Ask user: "Which docs need changes before the HTML?" or proceed directly to HTML if they say docs are approved
4. When building the HTML: use the design from `https://claude.ai/artifact/HHsgUaNgvXND4ipdQD72i5` as the template, extend to multi-tab covering all 13 sections
