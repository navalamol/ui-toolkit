# RUF Debug Suite — Missions Achieved

> Branch: `tier-1` · Repo: `ui-platform-elements/src/base/`

---

## Mission 1 — Foundation (Phase 1)

**Goal:** Zero-overhead, tenant-activatable debug tooling embedded in the base element mixin.

### Delivered

| File | What it does |
|---|---|
| `ruf-error-boundary.js` | Wraps `performUpdate` / `_propertiesChanged` in try/catch; logs crashes to `window.__RUF_ERRORS__`; renders fallback UI |
| `ruf-perf.js` | TTI tracker per component tag; stores in `window.__RUF_PERF__` |
| `ruf-prop-audit.js` | Traces property changes per element; activated by `window.__RUF_PROP_DEBUG__` |
| `ruf-inspector.js` | Hover-badge snapshot of component state |
| `ruf-memory.js` | Mount/unmount lifecycle counters via `FinalizationRegistry` |
| `ruf-aci-tracer.js` | Patches `aci.dispatch` to record action timeline |
| `ruf-slow-api.js` | Patches `DataObjectManager` to log slow API calls |
| `ruf-element.js` | Master gate: `_getDebugFlag()`, `_toolEnabled()`, gated `attach/detach` on all 8 tools |

### Architecture wins
- **Zero overhead when disabled** — static imports parse once; ~40 property reads per `connectedCallback`, unmeasurable (~100–300ns)
- **Master flag + per-tool backward compat** — `window.__RUF_DEBUG__ = true` enables all; `{ perf: true }` selective; per-tool flags still work standalone
- **No recursive instrumentation** — `<ruf-debug-panel>` extends plain `LitElement`, not `RufElement`

---

## Mission 2 — Panel + Console (Phase 2)

**Goal:** A floating UI so customers can download a report without any dev tools access.

### Delivered

| File | What it does |
|---|---|
| `ruf-console.js` | Patches `console.error/warn` into 200-entry ring buffer |
| `ruf-debug-panel.js` | `<ruf-debug-panel>` LitElement — floating 🐞 trigger, 8-tab slide-in panel, JSON report download |

### Panel tabs (Phase 2)
Summary · Perf · Errors · Console · ACI · Slow API · Memory · Env

### Wired in `ui-platform`
- `app-main/main-app.js` — Polymer `dom-if` on `[[globalSettings.rufDebugEnabled]]`
- `app-main-v2/main-app-v2.js` — Lit conditional on `this.globalSettings?.rufDebugEnabled`

---

## Mission 3 — Import, History, Pinpoint, Fix Table (Phase 2.5)

**Goal:** Let support import customer-sent reports; preserve history across refreshes; surface actionable code-level diagnostics.

### Delivered

#### Tool enhancements
| File | Addition |
|---|---|
| `ruf-perf.js` | Slow renders (>500ms) push `{ tag, ms, ts, stack }` to `window.__RUF_SLOW_RENDERS__` |
| `ruf-memory.js` | Storm events (>20 mounts) push `{ tag, count, ts, stack }` to `window.__RUF_STORMS__` |

#### Panel additions (Phase 2.5 → 10 tabs)
| Feature | Detail |
|---|---|
| **📥 Import** | File picker loads customer JSON report, shows in panel with `📥 IMPORTED` badge |
| **↩ Live** | Snaps back to live data from any history/imported view |
| **📋 History tab** | Auto-saves every Refresh + Download (max 20). Table shows time, source, session tail, issue preview |
| **🔍 Pinpoint tab** | Aggregates crashes, storms, slow renders, high-avg TTI, memory leaks, network errors — each with derived file path, details, 💡 fix recommendation, expandable call stacks |
| **Export Fix Table** | Downloads `ruf-fix-table-<ts>.json` — structured issues with `filePath`, `callStack`, `recommendation` for Claude ingestion |

---

## Mission 4 — Round 1: Vitals, Network, Annotation, HTML Report (Phase 3)

**Goal:** Complete observability for page-level health; polish support workflow.

### Delivered

#### New tools
| File | What it does |
|---|---|
| `ruf-vitals.js` | Core Web Vitals (LCP, CLS, INP/FID) + Long Task detector via `PerformanceObserver`. Stores in `window.__RUF_VITALS__` |
| `ruf-network.js` | Patches `window.fetch` + `XMLHttpRequest`. Logs all requests: URL, method, status, duration, size. Flags errors/slow/large. Stores in `window.__RUF_NETWORK_LOG__` (cap 200) |

Both wired in `ruf-element.js` — init once per page via `__RUF_VITALS_INIT__` / `__RUF_NETWORK_INIT__` guards.

#### Panel additions (Phase 3 → 12 tabs)
| Feature | Detail |
|---|---|
| **📝 Note row** | Persistent textarea in panel header — annotation included in all downloads |
| **📄 HTML export** | Self-contained `.html` report — opens in any browser, no viewer needed; sections, tables, expandable raw JSON |
| **Vitals tab** | LCP / CLS / INP cards with good/needs/poor colour coding + Long Tasks table |
| **Network tab** | All fetch/XHR requests with status, duration, size; filter by error/slow/large + URL search |
| **Page Health score** | Grade (A–F) + 0–100 score in Summary header, derived from vitals + errors + storms + slow API + network errors |
| **Component Health** | Per-component A–F grade in Perf tab column |
| **Stack filter toggle** | Pinpoint: "📦 App frames only" hides `node_modules/` except `ui-platform*`; toggle shows all |
| **Filters** | Console: level (all/error/warn) + text search; Errors: text search; Network: status + URL search |
| **Browser/version** | Env tab + Summary now show `Chrome 125` / `Edge 124` etc. (parsed from UA) |

---

---

## Mission 5 — Round 2: Causality Layer + Falcor Network

**Goal:** Understand *why* things re-render and *which* APIs are being called.

### Delivered

#### New tools
| File | What it does |
|---|---|
| `ruf-cycle-detector.js` | Patches `performUpdate` + `requestUpdate` to build a directed update graph; runs DFS on every update to detect component-to-component cycles; stores in `window.__RUF_CYCLES__` |

#### Tool enhancements
| File | Addition |
|---|---|
| `ruf-prop-audit.js` | **R2-A**: Hooks `requestUpdate(name, oldValue)` — records every property that triggered an update into `window.__RUF_RENDER_REASONS__[tag]` (last 50 per tag) with old/new value summaries and same-ref flag |
| `ruf-prop-audit.js` | **R2-B**: Thrash detector — flags when any prop is set >5× in 1 second; pushes `{tag, prop, count, windowMs, stack}` to `window.__RUF_THRASH__`; threshold configurable via `window.__RUF_THRASH_THRESHOLD__` |
| `ruf-aci-tracer.js` | **R2-C**: Frequency table — every dispatch increments `window.__RUF_ACI_FREQ__[name].count` and records source elements; `window.__RUF_ACI_FREQ_REPORT__()` console helper added |
| `ruf-network.js` | **Falcor**: Decodes `callPath`, `operation`, `domain`, `types`, `appName` from Falcor form-encoded POST bodies; stored in log entry's `falcor` field |

#### Panel additions (v4 → Round 2)
| Feature | Detail |
|---|---|
| **Perf tab row expansion** | Click any component row to see last 10 `requestUpdate` calls: prop name, old/new value summaries, `⚠️ same ref` flag (new object/array passed every render), timestamp |
| **ACI Frequency view** | Toggle button switches ACI tab between Timeline and Frequency views; Frequency shows sorted dispatch counts + source elements + 🔥 flag for actions >20 dispatches |
| **Network Falcor column** | Falcor requests show decoded `operation · domain`, `callPath`, and entity types instead of raw URL; Falcor filter in status dropdown; search also matches path/operation/types |
| **Pinpoint: property-thrash** | New issue type from `__RUF_THRASH__` — lists affected props, counts, fix recommendation (stable references) |
| **Pinpoint: circular-update** | New issue type from `__RUF_CYCLES__` — shows full cycle path (e.g. `pebble-grid → pebble-toolbar → pebble-grid`), count, fix recommendation (guard flag or unidirectional data flow) |
| **Summary stat chips** | Prop Thrash and Cycles chips appear when data is present |
| **Page Health score** | Deducts for thrash (−5 per incident, max −20) and cycles (−15 per cycle, max −30) |
| **HTML export** | Added Thrash + Circular Updates sections |

---

## Mission 6 — Round 3: DOM Health + Auto-POST Crash + History Diff + Falcor Expand

**Goal:** Surface DOM size problems, let support teams compare session snapshots, expose full Falcor query detail per network request, and automatically send crash reports to a configurable endpoint.

### Delivered

#### R3-A — Large DOM detector (panel-only)
`ruf-debug-panel.js`: `_collectReport()` now captures `domStats` at snapshot time:
- `domStats.totalNodes` — `document.querySelectorAll('*').length`
- `domStats.customElements` — `{[tag]: count}` for every custom element tag present

Summary chip turns amber when >1500 nodes. Page Health deducts −5/−10/−20. `_computeFindings()` adds 🌳 finding. HTML export adds collapsible "DOM Size" section.

#### R3-B — History diff / comparison
`ruf-debug-panel.js`:
- History rows now have checkboxes (max 2 selectable at once)
- "Compare N" button appears when exactly 2 are selected
- `_runDiff()` calls `_buildDiff(aReport, bReport)` and stores result in `this._diffView`
- `_renderDiff()` shows a full comparison view: metric table (health score, crashes, storms, network failures, avg render time, DOM nodes) with better/worse/same delta column; new issues (appeared in newer); fixed issues (gone in newer); new and removed component tags
- `_buildDiff()` is a module-level helper (not a method) for clean separation

#### R3-D — Auto-POST on crash
`ruf-error-boundary.js`:
- `_autoPostFired` flag (once per page load)
- `_tryAutoPost(entry)` — reads `mainApp.globalSettings.rufCrashEndpoint` + `rufCrashAutoPost`; POSTs lightweight crash JSON if both are set
- `_showCrashBanner()` — fixed-position green banner, auto-dismisses in 8s, close button

#### Network tab — Falcor row expansion
`ruf-debug-panel.js`:
- Every network row is now click-to-expand (`cursor:pointer`, ▼/▲ indicator)
- `_renderNetExpand(n)` shows two sections when a Falcor request is selected:
  - **Falcor**: callPath (dotted), path segments (A → B → C), method, operation, domain, app name, entity types as pills, pagination (from/to/maxRecords), sort (field · dir · type), valueContexts, extra filters JSON, pathSuffixes JSON
  - **Request details**: full URL, timestamp, duration with ⚠️ slow flag, response KB with ⚠️ large flag, error message

### Panel CSS additions
`.net-expand`, `.net-kv-key`, `.net-kv-val`, `.falcor-section`, `.falcor-header`, `.tag-pill`, `.diff-better/.diff-worse/.diff-same`, `.reason-row`, `.freq-hot`, `.section-title`

---

## Mission 7 — Round 4: Fix Table → Claude Pipeline + GET /data/ Falcor Decoding

**Goal:** Make the Fix Table export a direct input for Claude Code — include enough signal that Claude can read the right file, at the right line, with full context about related components. Also decode Falcor calls made via GET requests to `/data/*.json`.

### Delivered

#### R4-A — Fix Table Claude integration fields

**`ruf-debug-panel.js`** — `_exportFixTable()` now emits per-issue:

| Field | How it's computed |
|---|---|
| `lineNumber` | `_extractLineNumber(filteredStack)` — regex on `src/elements|base|managers` path patterns in the first matching stack frame |
| `readHint` | `"Read src/elements/<tag>/<tag>.js lines N-10 to N+10"` (or just the file if no line number) |
| `relatedComponents` | `_findRelatedComponents(tag, aciTimeline)` — finds components that share any ACI action name with the affected component |
| `claudePrompt` | One-sentence ready-to-paste instruction: severity + issueType + file:line + recommendation + related components |

**Pinpoint tab card** (`_renderIssueCard`) also shows:
- `:lineNumber` appended to the filepath chip in collapsed header
- ACI-related components as tag pills in the expanded body

#### GET /data/ Falcor decoding

**`ruf-network.js`** — `_parseFalcorGetUrl(rawUrl)`:
- Detects requests where URL contains `/data/` and query string has `paths=`
- Decodes `paths` JSON array; finds the embedded JSON-string segment containing `params`, `domain`, `operation`
- Extracts the same fields as the POST parser: `callPathArr`, `operation`, `domain`, `types`, `appName`, `options`, `sort`, `filters`, `valueContexts`, `fields`, `pathSuffixes`
- `_resolveFalcor(url, body)` tries POST body first, then GET URL — both call paths now produce a `falcor` field in the log entry

**Example handled:**
```
GET /data/entityData.json?paths=[["root","entityData","referenceData","cachedSearchResults",
  "{\"params\":{...},\"domain\":\"referenceData\",\"operation\":\"initiatesearch\"}",
  ["maxRecords","requestId"]]]&method=get
```

---

## Globals summary

| Global | Set by | Contains |
|---|---|---|
| `window.__RUF_ERRORS__` | `ruf-error-boundary.js` | Crash log array |
| `window.__RUF_PERF__` | `ruf-perf.js` | TTI stats per tag |
| `window.__RUF_SLOW_RENDERS__` | `ruf-perf.js` | Slow render incidents with stacks |
| `window.__RUF_MEMORY__` | `ruf-memory.js` | Mount/unmount Map |
| `window.__RUF_STORMS__` | `ruf-memory.js` | Storm incidents with stacks |
| `window.__RUF_ACI_TIMELINE__` | `ruf-aci-tracer.js` | ACI action sequence |
| `window.__RUF_SLOW_API_LOG__` | `ruf-slow-api.js` | Slow DataObjectManager calls |
| `window.__RUF_CONSOLE__` | `ruf-console.js` | console.error/warn ring buffer |
| `window.__RUF_VITALS__` | `ruf-vitals.js` | LCP, CLS, INP, long tasks |
| `window.__RUF_NETWORK_LOG__` | `ruf-network.js` | All fetch/XHR requests (with `.falcor` field when Falcor body detected) |
| `window.__RUF_RENDER_REASONS__` | `ruf-prop-audit.js` | Per-tag array of last 50 `requestUpdate` calls with prop/old/new summaries |
| `window.__RUF_THRASH__` | `ruf-prop-audit.js` | Property thrash incidents (prop set >threshold/sec) |
| `window.__RUF_ACI_FREQ__` | `ruf-aci-tracer.js` | Per-action dispatch frequency + source elements |
| `window.__RUF_CYCLES__` | `ruf-cycle-detector.js` | Detected circular update chains |
| `window.__RUF_HISTORY__` | `ruf-debug-panel.js` | Snapshot history array (max 20) |
| `window.__RUF_SESSION_ID__` | `ruf-debug-panel.js` | Page-load session identifier |

---

## Activation reference

```js
// Enable everything
window.__RUF_DEBUG__ = true

// Selective
window.__RUF_DEBUG__ = { perf: true, network: true, vitals: true, errorBoundary: true }

// Tenant (support sets in globalSettings — no console access needed)
mainApp.globalSettings.rufDebugEnabled = true
mainApp.globalSettings.rufDebugEnabled = { aciTracer: true, memory: true, network: true }

// Per-tool standalone
window.__RUF_PERF_ENABLED__     = true
window.__RUF_VITALS_ENABLED__   = true
window.__RUF_NETWORK_ENABLED__  = true
window.__RUF_PROP_DEBUG__       = '*'        // all components (also enables R2-A render reasons + R2-B thrash)
window.__RUF_PROP_DEBUG__       = 'pebble-grid'  // targeted
window.__RUF_THRASH_THRESHOLD__ = 3          // default 5 — lower for sensitive thrash detection
window.__RUF_CYCLE_DETECT__     = true       // R2-D circular update detector
window.__RUF_INSPECTOR__        = true
window.__RUF_ACI_TRACE__        = true
window.__RUF_SLOW_API__         = true
window.__RUF_CONSOLE_ENABLED__  = true
```
