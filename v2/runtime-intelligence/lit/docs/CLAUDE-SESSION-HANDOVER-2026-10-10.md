# Claude Session Handover — 2026-10-10

## Active working directory

`D:\Work\R7\generic-changes\perf-tool\1\runtime-intelligence\lit`

This project is the runtime-intelligence layer — a generic framework-neutral interpretation layer
(Lit, React, eventually Vue) built on top of the LDS diagnostic toolkit. It adds an
✨ Intelligence tab to the debug panel that names the probable root cause of errors and slow renders.

## Current state

- Missions 01–09.5 complete. Pre-Mission-10 audit + legacy wrapper hardening done.
- 95 tests pass, 0 fail. All changes uncommitted — the user commits, not Claude.
- Mission 09.5 wired `LitAdapter → EvidenceStore → IncidentFlightRecorder → analyzeIncident() → EvidenceCapsule` end-to-end.
- Mission 09.5 status: "EXECUTABLE/BROWSER REVIEW CHECKPOINT PENDING" — see `docs/MISSION-09.5-LIT-COLLECTOR-UREP-INTEGRATION.md` for the 8-point browser checklist.

## Workflow

Other AI developer implements → user brings updated folder to Claude → Claude reviews and gives
findings → user passes findings to developer → repeat.

Claude's role is reviewer + strategic advisor. Implement only when the user explicitly approves a plan.

## What was issued last session (2026-10-10)

Two specs were written for the developer. If they have not been implemented yet, the specs are below.
If they have been implemented, Claude should review the diff and report findings.

---

### P1 — `recordSlowRender()` in `src/integration/lit/legacy-collector-bridge.js`

Add alongside `recordLegacyLitError`:

```js
export function recordSlowRender(el, durationMs, { adapter, store }) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;

  const owner = adapter.ownerOf(el) ?? { id: 'unknown', tag: el.tagName?.toLowerCase() ?? 'unknown' };

  store.record({
    eventType: RuntimeEventType.UPDATE_COMPLETED,
    owner,
    payload: {
      durationMs,
      source: 'perf-legacy',
    },
  });
}
```

Constraints:
- No `causedByEventId`/`parentEventId`
- `payload.source: 'perf-legacy'` is mandatory (preserves semantic distinction from LitAdapter events)
- Re-export from any barrel that exports `recordLegacyLitError`
- Do NOT wire the caller — P1 only adds the function

New tests in `test/unit/lit-intelligence-pipeline.test.mjs`:
1. `recordSlowRender(el, 600, ...)` → pipeline enters `'slow-update-captured'`; trigger event has `payload.source === 'perf-legacy'`
2. `recordSlowRender(el, 400, ...)` → pipeline stays `'ready'`
3. `recordSlowRender(el, NaN, ...)` → no event emitted, pipeline stays `'ready'`

---

### P2 — Gate Intelligence tab install in `src/integration/lit/LitIntelligencePipeline.js`

In `start()`, wrap the `installLitIntelligencePanelPresentation` call with the existing opt-in check.

**First**, read `test/unit/root-cause-review-hardening.test.mjs` — find the "intelligence opt-in gate semantics" test and use that same flag/method. Do not introduce a second mechanism.

Constraints:
- Do NOT touch `__ldsIntelligencePresentationPatched`
- Do NOT change `connectedCallback`, `updated`, `_renderContent` patches
- Optional defense-in-depth: same guard at top of `installLitIntelligencePanelPresentation`

New tests in `test/unit/lit-intelligence-pipeline.test.mjs`:
1. Intelligence disabled → `start()` does NOT patch `lds-debug-panel` prototype
2. Intelligence enabled → tab installs as before (existing behavior confirmed)

---

## Next priorities (in order)

1. **P1 + P2** above — developer implements, Claude reviews
2. **P0 — Real UI Platform validation** (manual, not code):
   - `npm link` the package in UI Platform
   - Trigger a known error and a >500ms render
   - Confirm Intelligence tab labels are relevant
   - This is a gate before Mission 10
3. **Mission 10 — Vue Production Adapter**
   - Gate: P0 browser validation done
   - Read `docs/MISSION-09-REACT-PRODUCTION-ADAPTER.md` first — React is the architectural template
   - Vue must not pretend to expose Lit semantics; framework differences represented honestly

## Key architectural invariants (do not violate)

- Generic intelligence is **additive** — never remove/hide Lit/Main Platform surfaces
- Evidence ladder: observation < correlation < attribution < lifetime-violation < retainer-confirmed < causality-confirmed
- `causedByEventId` = causal edge only; `parentEventId` = structural lineage only
- `_reachable` for root-cause scoring uses CAUSES+PARENT only (not IC/TC)
- Privacy at capture and export boundaries — does not change evidence semantics
- Rules classify evidence; never manufacture stronger evidence
- `LitAdapter` is sole owner of Lit owner/update lifecycle evidence

## File locations (corrected 2026-10-10)

Integration files are under `src/integration/lit/` (not `src/pipeline/`):
- `src/integration/lit/LitIntelligencePipeline.js`
- `src/integration/lit/legacy-collector-bridge.js`
- `src/integration/lit/panel-intelligence-presentation.js`
