# Next Session Handover — Runtime Intelligence

Use this after `docs/CLAUDE-HANDOVER-BASELINE.md`. Do not reread all historical mission docs unless a specific implementation question requires them.

## Current intent

`Amonaval/runtime-intelligence` is the canonical development repository.

The advanced Lit/RUF baseline remains the gold-standard product experience:

- canonical reference: `navalamol/ui-toolkit@524d3c9a9e3864cd1f52f59d739ea10b8cdfd10a`
- original archive: `ui-toolkit-main (1).zip`

Runtime Intelligence must be an additive superset. Do not remove mature Lit/Main Platform/Falcor/panel capabilities to make the architecture look more generic.

## Read only this minimal order

1. `docs/CLAUDE-HANDOVER-BASELINE.md`
2. `docs/ENGINEERING-RULES.md`
3. `lit/docs/PRE-MISSION-10-AUDIT.md`
4. This file
5. Then read only source/tests relevant to the next task.

## Important review findings just validated

An external Claude review found two P0 defects. Both were independently verified against current `main` and fixed.

### P0-1 — `lit/src/core/gate.js`

The baseline file contained documentation-example assignments as live code inside `_toolEnabled()`.

Effects before the fix:

- every call force-enabled all diagnostics;
- per-tool opt-in semantics were bypassed;
- SSR/Node could crash because `window.*` was accessed before the guard.

Fixed on `main` by removing the accidental assignments and leaving the SSR guard first.

Regression coverage was added to `lit/test/unit/audit-hardening.test.mjs` to verify:

- `_toolEnabled()` returns false without `window`;
- calling it does not mutate/force-enable flags;
- an explicitly enabled tool still works independently.

### P0-2 — root-cause reachability

`lit/src/core/root-cause.js::_reachable()` incorrectly counted `INTERACTION_CONTEXT` and `TRACE_CONTEXT` edges as descendant reach when scoring root-cause candidates.

That allowed an interaction anchor to outrank an actually attributed `STATE_CHANGED` event simply because many events shared its interaction/trace context.

Fixed on `main` so candidate reachability follows only:

- `EdgeRelation.CAUSES`
- `EdgeRelation.PARENT`

Context edges remain useful for grouping/correlation but cannot inflate causal/root scoring.

Regression coverage was added to `audit-hardening.test.mjs`.

## Current product state

The generic kernel is meaningful and framework-neutral:

`adapter → UREP/EvidenceStore/privacy → EvidenceGraph → RootCause → SourceResolver → IncidentFlightRecorder → verification/capsule → resource ledger → diagnostic policy`

React proves that the core is not Lit-only.

However, the mature Lit product still has a parallel legacy signal path:

- `perf.js` → `window.__LDS_PERF__`
- `network.js` → `window.__LDS_NETWORK_LOG__`
- `error-boundary.js` → `window.__LDS_ERRORS__`
- `memory.js` → legacy memory/resource globals
- event tracer → legacy timeline globals
- mature panel consumes these globals

The generic UREP kernel and mature panel are therefore not yet one end-to-end product.

## Baseline compatibility already restored

Preserve these as first-class product surfaces:

- `lit/custom/ui-platform/**`
- `lit/docs/features/**`
- their package/build wiring

Do not create duplicate authoritative copies elsewhere.

## NEXT WORK — strict order

### 1. Restore + correctly wire `LdsDebugPanel.js`

This is the next task before new architecture work.

Restore exact baseline:

`lit/src/panel/LdsDebugPanel.js`

Canonical baseline blob SHA:

`048977590a6ce55122277a78e7385402cff6b84e`

Requirements:

- preserve original file formatting/content unless a current compatibility issue requires a tiny patch;
- restore package export `./panel`;
- restore Rollup panel input/output;
- keep panel separate from root `src/index.js` so generic/React consumers do not receive browser/custom-element side effects;
- build output should remain `lib/panel/LdsDebugPanel.js`;
- extend the existing baseline compatibility/package-integrity test so deleting panel source/export/build wiring fails mechanically;
- verify actual wiring, not merely file presence.

Do not restore unrelated extension assets in this task unless required to make the panel build valid.

### 2. Validate changed surface

Focused gates only:

- panel source syntax/import viability;
- package export target exists;
- Rollup input exists and maps to expected output;
- existing unit suite if checkout execution is available.

Do not claim tests/build were executed unless they actually were.

### 3. Mission 09.5 — Lit Collector → UREP end-to-end integration

Only after panel compatibility is restored.

Target proof:

`real Lit component/runtime signal → UREP → privacy → EvidenceStore → graph/root cause → recorder → evidence capsule → panel/product presentation → replay/verification`

A thin `LitIntelligencePipeline` coordinator is acceptable if it connects existing modules rather than inventing a parallel algorithm/product path.

Important design constraint: do not create a second investigation product beside the panel. The generic pipeline should become the intelligence substrate the panel can consume.

Integrate collectors incrementally and avoid double-counting Lit lifecycle events already emitted by `LitAdapter`.

### 4. Coverage gaps after Mission 09.5

Low-cost tests worth adding after the bridge is stable:

- `confirmed` cluster strength with `CAUSALITY_CONFIRMED` evidence;
- candidate scoring/tie-break behavior where ambiguity matters.

Do not turn private helper formulas into a frozen public contract purely for test coverage.

### 5. Mission 10 / Vue only after the Lit end-to-end path works

Do not add more framework adapters while the gold-standard Lit product still bypasses the generic intelligence kernel.

## Review items that should NOT drive unnecessary work

### Do not rewrite commit history

A Claude review of a separate `perf-tool` workspace saw Runtime Intelligence as a single large subtree commit. That is not a reason to rewrite the canonical `runtime-intelligence` history, which was developed mission-by-mission. Preserve current history.

### Do not maintain duplicate baseline trees intentionally

`custom/ui-platform` and `docs/features` belong in the canonical Runtime Intelligence Lit package because Main Platform is a supported first-class consumer. Avoid creating a separate second authoritative copy.

### Do not remove LitAdapter because legacy collectors bypass it today

The correct direction is to make LitAdapter/UREP the shared intelligence boundary while preserving specialized collectors. Removing the adapter would move architecture backward.

## Working rules

- correctness > diagnostic value > framework-neutral leverage > safety > perf > docs polish;
- one focused mission, one primary commit when possible;
- minimal diffs in baseline-owned files;
- preserve indentation/comments/order;
- correlation is never causality;
- no cloud/paid/CI dependencies;
- no broad refactors during compatibility restoration;
- stop when acceptance criteria pass.

## First command/mental model for the next session

Start with current `main`, inspect only:

- `lit/package.json`
- `lit/rollup.lib.config.js`
- `lit/test/unit/baseline-compatibility.test.mjs`
- baseline `lit/src/panel/LdsDebugPanel.js`

Restore and wire the panel. Do not start Mission 09.5 until that compatibility task is closed.
