# Mission 01 Closure — FrameworkAdapter v2 + Universal Evidence Protocol

Status: COMPLETE

## What this mission established

Mission 01 changes the architecture from a Lit-shaped adapter contract to a framework-neutral runtime evidence contract.

The kernel no longer asks frameworks to expose `requestUpdate`, `updated`, `updateComplete`, or other Lit-specific lifecycle semantics. Instead, framework adapters emit normalized runtime evidence and advertise what they can actually prove.

Core flow:

```text
Lit / React / Vue / Angular / Svelte / browser collectors
                         |
                         v
          Universal Runtime Evidence Protocol
                         |
                         v
              bounded evidence store
                         |
                         v
      future evidence graph / Pinpoint / reports / AI
```

## Product laws locked by this mission

1. Runtime evidence outranks model confidence.
2. Correlation is never presented as causality.
3. Evidence level and attribution quality remain separate concepts.
4. Adapters may have different proof strength for the same semantic event.
5. The generic core must not inherit Lit, React Fiber, Vue, Angular, or Svelte lifecycle vocabulary.
6. Raw object graphs are not retained by default.
7. Core runtime operation remains local-first, bounded, and cloud-independent.
8. The mature Lit implementation remains the gold-standard product experience while the generic engine evolves underneath it.

## Universal evidence ladder

```text
observation
   -> correlation
   -> attribution
   -> lifetime-violation
   -> retainer-confirmed
   -> causality-confirmed
```

This answers: **how far has the investigation progressed?**

Attribution quality is independent:

```text
deterministic
framework-reported
source-attributed
temporal-inference
heuristic
unknown
```

This answers: **how did we learn this fact?**

## Universal event vocabulary currently supported

- `owner.created`
- `owner.destroyed`
- `interaction`
- `state.changed`
- `dependency.triggered`
- `component.update.requested`
- `component.update.started`
- `component.update.completed`
- `resource.acquired`
- `resource.released`
- `network.started`
- `network.completed`
- `browser.frame`
- `navigation`
- `error`
- `diagnostic`

New event types should require a cross-framework justification. Framework-specific detail belongs in payloads or adapter/plugin extensions.

## FrameworkAdapter v2 capability contract

Adapters explicitly advertise:

- owner lifecycle
- update lifecycle
- update cause
- state change
- render timing
- source location
- reactive dependency
- resource ownership
- effect lifecycle

Support tiers:

```text
unsupported < inferred < partial < framework-reported < deterministic
```

`supports(capability, minimum)` uses this ordering, so deterministic support satisfies lower minimum requirements without callers hard-coding framework names.

## Lit v2 current profile

| Capability | Current support |
|---|---|
| owner lifecycle | deterministic |
| update lifecycle | deterministic |
| update cause | framework-reported |
| state change | framework-reported |
| render timing | deterministic |
| source location | partial |
| reactive dependency | partial |
| resource ownership | partial |
| effect lifecycle | unsupported |

The legacy Lit helper methods remain only in `LitAdapter` as migration shims. They are not part of the framework-neutral v2 contract.

## Implemented files

- `src/core/evidence-protocol.js`
- `src/core/evidence-store.js`
- `src/adapter/FrameworkAdapter.js`
- `src/adapter/lit/LitAdapter.js`
- `src/LitDebugMixin.js`
- `src/index.js`
- `test/unit/evidence-protocol.test.mjs`
- `test/unit/lit-adapter-v2.test.mjs`
- `docs/architecture/UNIVERSAL-EVIDENCE-PROTOCOL.md`
- `docs/architecture/FRAMEWORK-ADAPTER-V2.md`
- `docs/MISSION-01-FRAMEWORK-ADAPTER-V2.md`
- `docs/CLAUDE-HANDOFF-MISSION-01.md`
- `docs/BASELINE-SOURCE.md`

## Canonical advanced Lit reference

The advanced Lit product reviewed before this mission remains the product reference implementation.

Canonical source commit:

```text
navalamol/ui-toolkit
524d3c9a9e3864cd1f52f59d739ea10b8cdfd10a
```

That reference contains the mature `LdsDebugPanel`, Pinpoint, HTML report, Fix Table / Evidence Capsule, workflow baseline, replay/verification, resource lifetime work, Falcor integration and detailed feature documentation.

Do not redesign the product around future React/Vue/Angular adapters. Future adapters should feed a stronger version of that investigation workflow.

## Deliberately deferred

Mission 01 does NOT attempt to:

- build the evidence graph;
- infer root causes;
- migrate every existing LDS collector to UREP in one rewrite;
- build production React/Vue/Angular/Svelte adapters;
- redesign the panel;
- build a backend/cloud service;
- claim equal diagnostic certainty across frameworks.

These are deliberate boundaries, not missing work.

## Challenge list for Claude / future reviewers

Before extending the protocol, challenge:

1. Can a proposed event or edge be represented across at least two framework families?
2. Is the claimed evidence level stronger than what the collector can prove?
3. Is temporal adjacency being accidentally promoted to causality?
4. Does an adapter capability describe what is actually observable in public/stable APIs?
5. Is framework-specific vocabulary leaking into the generic core?
6. Could payload data expose enterprise-sensitive values?
7. Does the change make Pinpoint/root-cause investigation materially better, or merely add telemetry?
8. Can the same capability later feed HTML reports, baselines, verification and AI handoff without duplicate logic?

## Next mission

**Mission 02 — Evidence Graph + causal/root-cause grouping**

Effort: **HIGH**

Goal: convert normalized evidence events into relationships whose edges carry their own evidence strength and attribution quality.

Target examples:

```text
interaction
  -> state/dependency change
  -> component update
  -> downstream component work
  -> network/resource/browser symptom
```

Pinpoint should then be able to collapse many symptoms into one likely root cause without fabricating causality.

Key design requirement: a graph edge is evidence, not merely a connection. Every inferred edge must state why it exists and how strongly it is supported.

## Work immediately after Mission 02

1. Generic Source Resolver / source-map attribution — MEDIUM-HIGH
2. Incident Flight Recorder — MEDIUM
3. Extract workflow baseline + compare + verify + Evidence Capsule into generic core — HIGH
4. Resource Ownership Ledger v2 — HIGH
5. Privacy/redaction enterprise-safe export — MEDIUM-HIGH

Only after these foundations should React become a major implementation stream.
