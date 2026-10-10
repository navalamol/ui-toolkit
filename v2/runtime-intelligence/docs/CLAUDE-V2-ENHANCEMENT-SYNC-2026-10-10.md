# Claude v2 enhancement sync — 2026-10-10

This commit imports the reviewed enhancement delta from the uploaded `v2/runtime-intelligence` toolkit into the dedicated `Amonaval/runtime-intelligence` repository.

## Scope rule

Only the uploaded `v2/runtime-intelligence` work was reviewed as the enhancement source. Older folders in the uploaded toolkit were intentionally ignored.

This is an **overlay sync**, not a destructive mirror. Existing repository assets that were missing from the uploaded ZIP — notably the React adapter and baseline compatibility documentation — are preserved so a ZIP omission does not regress the dedicated repository.

## Product direction

The enhancement moves Runtime Intelligence toward a developer-answer-first flow:

```text
raw runtime signals
  -> bounded UREP evidence
  -> incident
  -> evidence graph
  -> root-cause interpretation
  -> compact developer answer
```

The intended developer-facing contract remains:

```text
Problem
Likely cause / strongest signal
Where
Impact
Do next
Confidence
Verification
```

Raw event IDs, graph details and forensic capsules remain secondary/deep-dive surfaces.

## Imported runtime capabilities

### Mission 10A — Reactive Cascade Tracker

- `LitAdapter` now tracks the active render stack.
- A child/sibling update requested while another component is actively rendering emits `DEPENDENCY_TRIGGERED` evidence.
- The evidence is framework-reported attribution rather than timing-only inference.
- New framework-neutral `CascadeAnalyzer` summarizes:
  - cascade root;
  - trigger count;
  - component count;
  - cascade depth;
  - total cascaded update time;
  - branch/component summaries;
  - over-reacting owners.
- The Lit intelligence pipeline exposes/publishes the latest cascade report.

### Mission 10B — Property Watch with mutation source

- `LitAdapter` supports state-change interceptors.
- New `PropertyWatchManager` can watch a selected component property.
- It captures a call stack at mutation time, resolves the first useful application source frame, and emits source-attributed `STATE_CHANGED` evidence where possible.
- Rolling mutation thresholds can emit watch diagnostics for repeated property churn.
- Developer console helpers are exposed while Runtime Intelligence is enabled:
  - `__LDS_WATCH_PROPERTY__`
  - `__LDS_UNWATCH_PROPERTY__`

### Mission 10C — Navigation / orphan-suspect diagnostics

- New browser-level `NavigationBridge` instruments `pushState`, `replaceState`, and `popstate`.
- Navigation emits standard UREP `NAVIGATION` evidence.
- Components that existed before navigation and remain without an observed destroy are surfaced as **orphan suspects**.
- These remain correlation-level findings, not confirmed memory leaks.

### Mission 10D — Network -> state correlation

- New framework-neutral `NetworkStateCorrelator` watches `NETWORK_COMPLETED` and nearby `STATE_CHANGED` evidence.
- A bounded temporal window links nearby activity through a trace context and diagnostic record.
- This provides the basis for developer-facing explanations such as:

```text
GET /api/products
  -> 47 ms later product-grid.items changed
```

### Mission 10E — Component update budget monitor

- New framework-neutral `UpdateBudgetMonitor` tracks rolling update frequency per owner.
- Default budget is intentionally lenient and supports per-tag overrides.
- Budget violations emit diagnostics containing update count, window, configured limit and timing information.

## Root-cause quality changes

`RootCauseGrouper` was adjusted so structural component ancestry is heavily discounted compared with explicit `CAUSES` reachability.

This addresses a real product-quality failure mode where a high-level component could rank as the likely root simply because it structurally owned many descendants.

The ranking now gives substantially more weight to explicit causal edges and evidence strength, while structural ancestry remains weak context only.

## Pipeline and presentation integration

The Lit intelligence pipeline now creates/starts/stops:

- `CascadeAnalyzer`
- `PropertyWatchManager`
- `NavigationBridge`
- `NetworkStateCorrelator`
- `UpdateBudgetMonitor`

The compact developer summary and Intelligence-tab presentation remain the default product surface. Full forensic evidence remains available through the pipeline/capsule API rather than being forced into normal UI.

The presentation layer also adds sections for cascade, navigation/orphan, network-state and update-budget findings when relevant evidence exists.

## Compatibility preserved during repository sync

The uploaded ZIP had inconsistencies that were **not** intentionally copied as regressions:

- package metadata referenced a React adapter while the ZIP lacked the adapter file;
- several baseline feature documents expected by compatibility tests were absent from the ZIP.

The dedicated repository already contains those assets, so this sync preserves them.

## Validation observation from the raw uploaded snapshot

Before repository overlay, the raw uploaded v2 snapshot produced:

```text
116 tests
111 passed
5 failed
```

The failures were primarily related to the ZIP's missing React adapter/baseline compatibility assets plus a cascading pipeline import failure. Because this repository sync preserves those existing assets, the dedicated repo is intentionally not made equivalent to those accidental omissions.

A complete green-suite/build/browser checkpoint is deferred to the next hardening mission rather than being falsely claimed in this import commit.

## Known evidence-semantics issue to harden next

The reviewed `NetworkStateCorrelator` currently emits temporal correlation with:

```text
EvidenceLevel.CORRELATION
AttributionQuality.TEMPORAL_INFERENCE
```

but also carries `causedByEventId` referencing the network event. In the current `EvidenceGraph`, `causedByEventId` creates a `CAUSES` edge.

That overstates what timing alone proves.

Next mission must change temporal network/state matching so it produces contextual/trace correlation only. A regression test should explicitly assert:

```text
network + state within correlation window
  -> TRACE_CONTEXT: yes
  -> CAUSES: no
```

Only explicit callback/setter instrumentation should be allowed to upgrade this to attribution/causality.

## Other next-hardening items

1. Debounce `UpdateBudgetMonitor` so one over-budget episode does not produce a diagnostic flood.
2. Keep navigation findings as suspects until stronger lifetime/retainer evidence exists.
3. Create a single canonical `docs/STATUS.md` for current validated state.
4. Reconcile roadmap/status documents so historical mission docs are not competing sources of truth.
5. Run the complete checkpoint:

```text
npm test
npm run test:smoke
npm run build
real UI Platform browser validation
```

## Recommended next mission

**Mission 10F — Integrity + Evidence Semantics Hardening**

Priority: **Medium effort, high importance**.

The rule for 10F is simple:

> Never claim more than the runtime can prove, and never make the developer work harder to understand the answer.
