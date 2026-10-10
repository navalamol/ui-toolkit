# RUF Debug Suite — Roadmap

> Current state: **Round 4 complete** (Fix Table → Claude pipeline: lineNumber, readHint, relatedComponents, claudePrompt; GET /data/ Falcor decoding)
> See `RUF-MISSIONS.md` for what is already built.

---

## Round 2 — Causality layer ✅ COMPLETE

**Theme:** Understand *why* things re-render, not just *that* they did.

### R2-A — Re-render reason tracker ✅

**File:** extend `ruf-prop-audit.js`

When a LitElement `update()` fires, record exactly which property changed, old value → new value, and timestamp. Correlate with perf data so the Pinpoint tab can say:
> `<pebble-grid>` re-rendered 47 times — property `columns` changed each time (new `[]` literal passed from parent)

**Implementation note:** Hook into `LitElement`'s `requestUpdate(name, oldValue)` in `attach()`. Track last 50 changes per element.

**Panel:** New sub-table in Perf tab row expansion: "Last changes that triggered updates"

---

### R2-B — Property thrash detector ✅

**File:** `ruf-prop-audit.js`

Flag when a property on the same element is set >5 times within 1 second. Store in `window.__RUF_THRASH__`. Show in Pinpoint as `property-thrash` issue type.

**Threshold:** configurable via `window.__RUF_THRASH_THRESHOLD__ = 5`

---

### R2-C — ACI frequency + source map ✅

**File:** extend `ruf-aci-tracer.js`

Track:
1. How many times each action name was dispatched (frequency table)
2. Which element dispatched each action (capture `this` context in dispatch patch)

Store in `window.__RUF_ACI_FREQ__` = `{ [actionName]: { count, sources[] } }`

**Panel:** ACI tab — add "Frequency" view toggle; flag action names fired >20 times

---

### R2-D — Circular update detector ✅

**File:** `ruf-cycle-detector.js` (new)

Track property-change→render→property-change chains. If a chain cycles back to the same component within 3 hops, record it as a cycle. Store in `window.__RUF_CYCLES__`.

**Panel:** Pinpoint tab — new issue type `circular-update` with cycle path: `A.foo → B.bar → A.foo`

---

## Round 3 — DOM health + advanced ✅ COMPLETE

### R3-A — Large DOM detector ✅

**Implementation:** In `ruf-debug-panel.js`, count `document.querySelectorAll('*').length` on Refresh. Flag in Summary if >1500 nodes. Show breakdown by custom element tag count.

No new tool file needed — just a panel enhancement.

---

### R3-B — Report comparison / diff ✅

**Panel:** History tab enhancement.

Select two history snapshots → "Compare" button → new `diff` view showing:
- Metrics that got worse (perf avg, error count, new issues)
- Metrics that improved
- New components appearing / disappearing

Useful for: "it worked yesterday, broken today" support cases.

---

### R3-C — Dynamic import loader (true zero-bundle)

**File:** `ruf-debug-suite.js` (new)

```js
export async function loadDebugSuite(flag) {
    window.__RUF_DEBUG__ = flag;
    await Promise.all([
        import('./ruf-error-boundary.js'),
        import('./ruf-perf.js'),
        // ...all tools
    ]);
}
```

`ruf-element.js` removes static imports; checks `window.__RUF_TOOLS__` instead.
`app-base.js` calls `loadDebugSuite()` at startup if flag is set.

**Benefit:** When disabled, 0 bytes downloaded/parsed (depends on Webpack code-splitting in consumer).

---

### R3-D — Auto-POST on crash ✅

**File:** extend `ruf-error-boundary.js`

When a CRITICAL crash is caught, and `globalSettings.rufCrashEndpoint` is configured, POST the full report JSON automatically. Customer sees a toast; support gets the report without any customer action.

**Config:**
```js
mainApp.globalSettings.rufCrashEndpoint = 'https://support.syndigo.com/ruf-ingest'
mainApp.globalSettings.rufCrashAutoPost = true
```

---

## Round 4 — Claude integration (auto-fix loop) ✅ COMPLETE

**Theme:** Close the loop — collect, analyze, fix.

### R4-A — Fix Table → Claude pipeline ✅

The current "Export Fix Table" downloads a JSON. Round 4 formalizes the Claude workflow:

1. Customer encounters issue → support enables RUF → customer downloads report
2. Support uploads `ruf-fix-table-<ts>.json` to Claude with prompt:
   > "Scan the files in this fix table and fix the issues listed."
3. Claude reads each `filePath`, examines the code at the relevant lines (using call stacks as hints), and applies targeted fixes.
4. Claude creates a PR. Support validates.

**What makes this work well:**
- `filePath` is a direct path to the source file (`src/elements/<tag>/<tag>.js`)
- `filteredCallStack` removes third-party noise — only app frames remain
- `recommendation` gives Claude the fix direction
- `issueType` constrains the type of fix (slow-render → memoization, memory-leak → disconnectedCallback cleanup, etc.)

**R4-A additions to Fix Table export:**
- `lineNumber` — parsed from the filtered call stack's first app-source frame
- `readHint` — exact `Read src/elements/<tag>/<tag>.js lines N-10 to N+10` instruction for Claude
- `relatedComponents` — components that share ACI actions with the affected component (from `aciTimeline`)
- `claudePrompt` — ready-to-paste one-sentence instruction combining severity, issueType, file, line, recommendation, and related components

**Pinpoint tab also shows:**
- `:lineNumber` appended to the filepath chip in the card header
- ACI-related components as tag pills in the expanded card body

---

### R4-B — Automated regression check

After Claude applies fixes, re-run `npm run test:coverage`. If tests pass and no new console errors appear in a test session, the fix is clean. Wire this into CI so RUF issues become trackable items.

---

## Idea backlog (assess before building)

| Idea | Value | Complexity | Notes |
|---|---|---|---|
| Session replay sketch (ACI + mount sequence) | Medium | Medium | ACI timeline + mount order gives narrative without screen recording |
| A11y checker (axe-core integration) | Medium | Low | `import('axe-core').then(axe => axe.run())` on demand |
| Duplicate import detector (src/ vs lib/) | Medium | Low | Check `performance.getEntriesByType('script')` for duplicate module paths |
| Heap snapshot delta | High | High | `performance.measureUserAgentSpecificMemory()` requires COOP/COEP headers |
| Polymer `notifyPath` flood detector | Medium | Medium | Relevant for Polymer→Lit migration debugging |
| Shareable URL (report as base64 fragment) | Low | Low | Works only for small reports; useful for quick sharing |
| Network failure auto-retry advisor | Low | Low | Suggest retry strategies based on status codes |
| Theme token audit | Low | Medium | Which CSS vars are overridden from defaults |

---

## Observation backlog (polish items)

These were raised during testing and should be addressed before any customer-facing release:

| Item | Status | Notes |
|---|---|---|
| Stack filter defaults to app-frames-only | ✅ Done | Toggle in Pinpoint tab; hides `node_modules/` except `ui-platform*` |
| Browser/version shown (not just raw UA) | ✅ Done | `_parseBrowserInfo()` in panel — shows `Chrome 125` etc. |
| Component health per-row in Perf tab | ✅ Done | A–F grade column |
| Page health grade in Summary | ✅ Done | Score 0–100 derived from vitals + errors + storms |
| Console level filter | ✅ Done | error / warn / all dropdown |
| Error component/message filter | ✅ Done | Text search input |
| Network status/URL filter | ✅ Done | Status dropdown + URL search |
| Note/annotation field | ✅ Done | Textarea in panel header, included in all exports |

---

## Session start checklist

1. Read `RUF-DEBUG-HANDOVER.md` for repo locations and git state
2. Read `RUF-MISSIONS.md` for what is already built
3. Read this file to pick the next round
4. Check `src/base/` for current file list
5. Add new requirements to `RUF-DEBUG-HANDOVER.md` → "Extra requirements" section
