# Claude Session Handover — 2026-10-07

Use this as the entrypoint for the next session.

---

## Session summary

This session acted as **expert reviewer** of AI developer work on the `runtime-intelligence` workstream. No production code was written to `perf-tool` (all implementation was done by the other AI developer). Two commits were made to the standalone `D:\Work\R7\generic-changes\runtime-intelligence` repo (see §7 below); those should not be continued there — the canonical development target is `perf-tool/1/runtime-intelligence`.

---

## Active workflow

```
Other AI developer → implements in perf-tool/1/runtime-intelligence (or next version folder)
        ↓
User → brings updated folder to Claude
        ↓
Claude → reviews, identifies issues, writes findings
        ↓
User → passes findings back to other AI developer
        ↓
repeat
```

Claude's role: **reviewer only**. Do not implement unless explicitly asked.

---

## Repository map

| Path | Purpose | Notes |
|---|---|---|
| `D:\Work\R7\generic-changes\perf-tool\lit\` | Original Lit product baseline | 143KB panel, 12 collectors, Falcor/ACI plugins |
| `D:\Work\R7\generic-changes\perf-tool\runtime-intelligence\lit\` | Baseline generic intelligence kernel | Missions 01–09 + pre-M10 hardening; 106 tests (1 FAIL in original, now fixed) |
| `D:\Work\R7\generic-changes\perf-tool\1\runtime-intelligence\lit\` | **Active new work** (reviewed this session) | 110 tests pass, 0 fail; Mission 09.5 complete |
| `D:\Work\R7\generic-changes\runtime-intelligence\` | Standalone repo (separate git) | Claude's own Mission 09.5 work here — NOT the target anymore |

**The canonical development target going forward is `perf-tool/1/runtime-intelligence/lit/` (or whatever version folder the user provides next).**

---

## State of `perf-tool/1/runtime-intelligence` (what was reviewed)

### Commits above the baseline (12 total):

```
5012db2  fix: restore opt-in diagnostic gate semantics
ccb1cda  fix: keep context edges out of root-cause reachability
e826f6b  test: cover gate semantics and root-cause context reachability
633ce94  fix: restore debug panel package compatibility
c367c00  feat: bridge Lit error collector into UREP
953c994  feat: surface generic intelligence in existing LDS panel
1969bae  feat: add Lit intelligence pipeline coordinator
3ef2943  feat: emit error-boundary failures through UREP bridge
44e3789  feat: start Lit intelligence pipeline with debug mixin
4c24cd3  test: close Mission 09.5 Lit collector UREP integration
3e18e74  fix: isolate panel verification snapshots
d62b077  fix: start Lit recorder before owner lifecycle evidence
```

### What was fixed (all P0/P1 issues from review):

- ✅ `gate.js` force-enable bug — JSDoc examples as live code inside `_toolEnabled()` — FIXED
- ✅ `root-cause.js` IC/TC edge scoring — INTERACTION anchor inflated score over STATE_CHANGED — FIXED
- ✅ Debug panel missing — `src/panel/LdsDebugPanel.js` (145KB, 2293 lines) — ADDED
- ✅ `./panel` package export — ADDED
- ✅ Rollup panel build target — ADDED

### New files added:

| File | What it does |
|---|---|
| `src/integration/lit/LitIntelligencePipeline.js` | UREP coordinator: subscribes to EvidenceStore, autoFreezes on ERROR events, builds EvidenceGraph + RootCauseGrouper + EvidenceCapsule, publishes to `window.__LDS_INTELLIGENCE__` via CustomEvent |
| `src/integration/lit/legacy-collector-bridge.js` | Translates `LdsErrorBoundary` catches into UREP `ERROR` events with causal linking and source attribution |
| `src/integration/lit/panel-intelligence-presentation.js` | Monkey-patches `LdsDebugPanel.prototype.updated` to inject intelligence banner; wraps `_completeReplay` for verification feedback |
| `src/panel/LdsDebugPanel.js` | Full 12-tab debug panel ported from ruf-debug-panel.js, registered as `<lds-debug-panel>` |

### Modified files:

- `src/LitDebugMixin.js` — starts `getLitIntelligencePipeline()` BEFORE `litAdapter.connect()` (critical ordering)
- `src/index.js` — exports `LitIntelligencePipeline` and `getLitIntelligencePipeline`
- `package.json` — adds `./panel` export
- `rollup.lib.config.js` — adds panel build target

### Test state:

- **110 pass, 0 fail**
- New: `lit-intelligence-pipeline.test.mjs` — end-to-end error path test
- New tests in `audit-hardening.test.mjs` — gate SSR safety + root-cause reachability
- New test in `baseline-compatibility.test.mjs` — panel export wired correctly

---

## Pending feedback — pass to AI developer for next round

These are the findings from this session's review, in priority order:

### P1 — Slow render trigger missing from `LitIntelligencePipeline`

**Problem:** `#onEvidence()` only reacts to `RuntimeEventType.ERROR`. `UPDATE_COMPLETED` events with slow `durationMs` (perf.js already detects these at >500ms) are ignored — never captured as intelligence incidents.

**Fix:**
```js
// In LitIntelligencePipeline.js constructor options:
// Add: slowRenderThresholdMs = 500

// In #onEvidence():
#onEvidence(event) {
  if (event.type === RuntimeEventType.ERROR) {
    this.#analyze(event);
    return;
  }
  if (event.type === RuntimeEventType.UPDATE_COMPLETED) {
    const ms = event.payload?.durationMs;
    if (Number.isFinite(ms) && ms >= this.#slowRenderThresholdMs) {
      this.#analyze(event);
    }
  }
}
```

Add `slowRenderThresholdMs` to constructor options (default 500) and add one test covering the slow render trigger path alongside the existing error path test.

### P2 — `_completeReplay` private method coupling

**Problem:** `panel-intelligence-presentation.js` wraps `LdsDebugPanel.prototype._completeReplay`. This is a `_`-prefixed private method — if renamed, the verification feedback path silently becomes a no-op. The double-patch guard prevents crashes but the fragility is structural.

**Preferred fix:** Dispatch a `lds-replay-complete` CustomEvent from the panel when a replay completes; the bridge listens to that event instead of wrapping the private method. This decouples bridge from panel internals.

**If not ready for that refactor:** At minimum, add a comment flagging this as a known fragility milestone and add a test that verifies verification feedback actually reaches the pipeline.

### P2 — `confirmed` cluster strength never tested

**Problem:** `_clusterStrength()` has three branches: `confirmed`, `attributed`, `correlated`. Only `attributed` and `correlated` are tested. `confirmed` requires `CAUSALITY_CONFIRMED` edge evidence level.

**Fix:** Add one test in `audit-hardening.test.mjs`:
```js
test('causality-confirmed edge produces confirmed cluster strength', () => {
  // build two events with explicit causedByEventId + CAUSALITY_CONFIRMED evidence level
  // assert cluster.strength === 'confirmed'
});
```

---

## What's NOT done yet (future missions)

| Item | Notes |
|---|---|
| Bridge `perf.js` slow renders to UREP | `perf.js` writes to `window.__LDS_SLOW_RENDERS__` only; a `recordSlowRender()` bridge in `legacy-collector-bridge.js` would complete performance monitoring |
| Bridge `network.js` into UREP | Same pattern as error bridge — emit `NETWORK_COMPLETED` via legacy-collector-bridge |
| Mission 10 — Vue Production Adapter | Gate condition (09.5 complete) is now met |
| Bridge: `perf-tool/lit` ↔ `runtime-intelligence` | The original panel (`perf-tool/lit/src/panel/LdsDebugPanel.js`) still consumes window globals, not EvidenceStore. This is a major future mission. |
| Gate panel-intelligence-presentation behind opt-in flag | Currently always-on; should be `_toolEnabled('intelligence')` |

---

## Key architectural invariants (never break these)

1. **Generic intelligence is additive** — never remove/hide Lit/Main Platform surfaces
2. **Evidence ladder**: observation < correlation < attribution < lifetime-violation < retainer-confirmed < causality-confirmed
3. **`_reachable()` in root-cause.js uses CAUSES + PARENT only** — IC/TC edges inflate anchor scores (this was the bug; fix is in place)
4. **`gate.js` is read-only** — `_toolEnabled()` must never write to `window`, only read
5. **Privacy at capture and export boundaries** — does not change evidence semantics
6. **Recorder must start before adapter.connect()** — `d62b077` fixes this; do not regress

---

## How to start the next review session

1. Read this file
2. User will provide a new folder path (e.g. `perf-tool/2/runtime-intelligence`)
3. Launch 3 parallel Explore agents:
   - Agent 1: git log, file diff (new vs previous version), test run
   - Agent 2: read new/changed core files and integration layer
   - Agent 3: read new/changed tests and docs
4. Check against the pending feedback items above — were they addressed?
5. Find any new issues
6. Write prioritized findings

Do not implement. Pass findings to the user to relay to the AI developer.

---

## Claude's own work this session (for reference)

Two commits were made to `D:\Work\R7\generic-changes\runtime-intelligence` (separate standalone repo, NOT perf-tool):

1. `1ba4584` — fix: root-cause scoring (IC/TC edge removal) — same fix that `ccb1cda` applied in perf-tool
2. `8cbd23d` — feat: `LitIntelligencePipeline` in `src/pipeline/` (proof-of-concept, simpler than the production version)

These are superseded by the more complete implementation in `perf-tool/1/runtime-intelligence`. The standalone repo work is informational only.
