# Runtime Intelligence — Current Status

**Updated:** 2026-10-10  
**Canonical status:** this file is the single current-state summary. Historical mission/handover files are context, not competing status sources.

## Current product state

Runtime Intelligence is an additive developer-answer layer above the mature LDS panel.

Active path:

```text
runtime collectors/adapters
  -> UREP evidence store
  -> incident recorder
  -> evidence graph
  -> root-cause grouping
  -> developer summary
  -> Intelligence tab / evidence capsule
```

The governing rule is evidence honesty: observation, correlation, attribution and confirmed causality must never be conflated.

## Strategic review state — keep intact

Claude's strategic review deliberately reduced active scope:

- `lit/src/archive/diagnostic-policy.js` — archived; detached from active pipeline.
- `lit/src/future/resource-ownership-ledger.js` — deferred until resource acquire/release UREP wiring exists.
- old Mission 01–09 architecture/history material belongs under `lit/docs/archive/`.
- active work should build on this narrowed topology; do not automatically reconnect archived/future modules.

Lit is a **required** peer dependency by product decision. Do not make it optional unless that decision changes explicitly.

## Completed active missions

- Missions 01–09.5 — historical foundation; archive/defer decisions preserved.
- Mission 10A — Reactive Cascade Tracker.
- Mission 10B — Property Watch + mutation source.
- Mission 10C — Navigation / orphan-suspect diagnostics.
- Mission 10D — Network -> State temporal correlation.
- Mission 10E — Component Update Budget Monitor.
- Mission 10F — Integrity + Evidence Semantics Hardening.

## Mission 10F hardening

1. Temporal Network -> State matching no longer sets `causedByEventId`.
2. Network evidence receives trace context at capture time; correlation diagnostics reuse it.
3. Regression guarantee: temporal match may create `TRACE_CONTEXT`, never `CAUSES` from the network event.
4. Update-budget diagnostics emit once per continuous violation episode and re-arm after recovery.
5. Strategic archive/future topology remains authoritative.
6. Lit remains required in package metadata.
7. Confidence-aware product wording and structural-ancestry discounting from Claude's strategic review remain intact.

## Validation

Focused Mission 10F validation in the reviewed v2 snapshot:

```text
35 / 35 focused evidence/root-cause/network/budget tests passing
3 / 3 dedicated Mission 10F regression tests passing
```

The broader active snapshot suite also passes apart from tests whose imports are missing from the uploaded ZIP (notably the React adapter/baseline guides). The dedicated repository already contains those assets and they must be preserved during sync.

A final browser checkpoint in the real UI Platform remains required for product-level validation.

## Next validation checkpoint

Use real UI Platform scenarios:

1. runtime error -> correlated result must say **Strongest signal**, not **Likely cause**;
2. slow render -> named component/signal must be genuinely related, not merely a high ancestor;
3. network followed by state mutation -> forensic graph must show context correlation without a causal network edge;
4. sustained over-render burst -> one budget diagnostic per episode, not one per render.

## Next development decision

After real-app validation, choose the next mission from current active value, not historical backlog. Do not reconnect `src/archive/` or `src/future/` without an explicit product decision.
