# Canonical Advanced Lit Baseline

The product reference for Runtime Intelligence is the advanced Lit/RUF toolkit snapshot developed before FrameworkAdapter v2.

## Exact source

Repository: `navalamol/ui-toolkit`  
Commit: `524d3c9a9e3864cd1f52f59d739ea10b8cdfd10a`  
Commit message: `Falcor Master Toolkit lit-debug-suite Falcor Tab`

This is the exact commit represented by the uploaded `ui-toolkit-main (1).zip` used during Mission 01 review.

## Why this reference matters

The advanced Lit implementation is the **gold-standard product experience**, not disposable legacy code. Future framework work must preserve or improve its useful depth:

- deep component/runtime inspection;
- Pinpoint investigation workflow;
- evidence levels and source/call-stack attribution;
- resource lifetime tracking;
- workflow baselines and before/after verification;
- HTML investigation export;
- Fix Table / evidence capsule / Claude handoff;
- history/report comparison;
- ui-platform/Falcor/ACI semantic enrichment.

FrameworkAdapter v2 and UREP are intended to make these ideas reusable across React, Vue, Angular, Svelte and other runtimes. They must not flatten the product into a generic telemetry dashboard.

## Important reference paths in the canonical commit

- `lit/src/panel/LdsDebugPanel.js` — mature investigation UI, Pinpoint, HTML/report/AI workflow
- `lit/src/core/*` — Lit/runtime collectors
- `lit/custom/ui-platform/*` — Falcor/ACI/Syndigo semantic plugins
- `lit/docs/features/*` — feature-level behavior and operator guidance
- `lit/LDS-HANDOVER.md`
- `lit/PHASE10-HANDOVER.md`
- `lit/PHASE11-HANDOVER.md`
- `lit/USER-GUIDE.md`
- `ui-platform/*` — original RUF implementation that led to the generic Lit package
- `docs/history-md-files/*` — earlier RUF missions/roadmap/handover context

## Repository-copy note

`runtime-intelligence` is the canonical repository for new product development. The exact source commit above remains the immutable baseline reference while the repository is progressively reorganized around a framework-neutral core. Large generated bundles/maps should not be treated as source-of-truth product code.

When a future agent changes Pinpoint, reporting, baselines, resource ownership, AI handoff, or panel behavior, compare the proposed behavior against this baseline before accepting a regression.
