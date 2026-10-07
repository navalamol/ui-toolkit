# Claude Review Loop and Mission 09.5 Decision Log

## Why this file exists

This repo is now using a deliberate builder/reviewer loop:

1. ChatGPT implements the mission and keeps the repo moving.
2. Claude independently reviews the resulting code and architecture.
3. Review feedback is not accepted automatically. It is checked against the actual current `main` branch, existing contracts, tests, and product constraints.
4. Useful feedback is incorporated; weak, duplicate, premature, or semantically incorrect suggestions are rejected with justification.
5. The loop repeats until the mission is genuinely closed.

This is a good strategy for this project because it reduces single-model blind spots while preserving one coherent implementation direction. The user acts as the arbiter and keeps both systems evidence-driven.

This review loop should be reused periodically at meaningful boundaries rather than after every tiny edit. Recommended checkpoints:

- after a compatibility-sensitive mission,
- after an architectural integration mission,
- before introducing a new framework adapter,
- before large product-surface changes,
- before declaring a milestone closed.

The goal is not to maximize review comments. The goal is to find high-value mistakes while keeping missions efficient.

---

## Review considered

Claude re-reviewed the post-baseline `runtime-intelligence` work and recommended continuing the current direction. It identified the error-boundary -> UREP -> recorder -> evidence graph -> root cause -> evidence capsule -> existing LDS panel -> replay verification path as stronger than its earlier proof of concept.

The overall verdict was accepted.

The review also proposed or highlighted:

- slow-render incident triggering,
- bridging legacy perf data,
- confirmed root-cause-strength coverage,
- candidate-score tie-break coverage,
- replacing private `_completeReplay` coupling with a public event later,
- a public `analyzeIncident()` API,
- bridging network evidence,
- gating the intelligence panel bridge,
- eventually removing prototype mutation.

---

## Corrections made to the review itself

The review was useful but not perfectly reconciled with the current Git history.

Two commit descriptions were reversed:

- `953c994` is `feat: add Lit intelligence pipeline coordinator`.
- `1969bae` is `feat: surface generic intelligence in existing LDS panel`.

The review also undercounted the post-baseline commits by omitting the next-session handover and focused panel-compatibility cleanup commits.

These are bookkeeping errors, not architecture blockers, but they reinforce the reason for verifying reviewer claims against `main` rather than applying recommendations mechanically.

---

## Feedback accepted and implemented

### 1. Add slow Lit incident analysis

Accepted, with two semantic refinements.

`LitAdapter.recordUpdateCompleted()` already emits UREP `UPDATE_COMPLETED` evidence with `payload.durationMs`. That is the correct signal for an individual Lit update/render duration.

Mission 09.5 now treats a qualifying `UPDATE_COMPLETED` as an analyzable performance incident using a configurable threshold. The initial default is 500 ms to align with the mature diagnostic suite's existing notion of a visibly slow component path.

The pipeline now recognizes:

- `ERROR` -> reason `lit-runtime-error`
- slow `UPDATE_COMPLETED` -> reason `lit-slow-update`

The second refinement came from a final self-review after implementation: a slow update must not hard-freeze the flight recorder, because that could hide a later runtime error. Therefore:

- runtime errors remain the hard `IncidentFlightRecorder` freeze trigger,
- slow updates are analyzed from the rolling recorder snapshot without consuming the recorder,
- a later runtime error still freezes and replaces the performance symptom as the stronger incident.

This keeps incident detection inside the framework-neutral evidence path without creating a second Lit-specific slow-render collector or weakening crash capture.

### 2. Preserve opt-in diagnostic semantics

Accepted and promoted in priority.

The previous integration started `LitIntelligencePipeline` unconditionally from `LitDebugMixin._initPageTools()`. That conflicted with the repo's explicit opt-in diagnostics model, particularly after gate behavior had just been hardened.

The intelligence pipeline is now gated via `_toolEnabled('intelligence')` and can be independently enabled with:

```js
window.__LDS_INTELLIGENCE_ENABLED__ = true;
```

It is also enabled by the normal master debug semantics:

```js
window.__LDS_DEBUG__ = true;
```

or:

```js
window.__LDS_DEBUG__ = { intelligence: true };
```

The lightweight UREP adapter lifecycle itself remains part of the mixin architecture. The recorder, incident analysis, and panel presentation are the opt-in product behavior.

### 3. Add slow-path regression coverage

Accepted.

The Mission 09.5 integration test now covers:

- a qualifying UREP `UPDATE_COMPLETED` slow analysis,
- the `lit-slow-update` reason,
- capsule problem semantics,
- the configured threshold in capsule environment metadata,
- a below-threshold update that must not create an incident,
- a slow update not consuming the flight recorder,
- a later runtime error still becoming the frozen incident.

### 4. Add root-cause hardening tests

Accepted and bundled into Mission 09.5 closure rather than split into standalone missions.

Added coverage protects:

- `CAUSALITY_CONFIRMED` edge -> `confirmed` cluster strength,
- deterministic earlier-sequence tie-break when root-cause candidate scores are equal,
- intelligence gate opt-in behavior.

The purpose is to protect root-cause ranking semantics cheaply, not to create test-only scope.

### 5. Track private panel coupling as transitional debt

Accepted.

`panel-intelligence-presentation.js` currently wraps `LdsDebugPanel.prototype.updated` and the private `_completeReplay` method. The patch is guarded and intentionally transitional, but `_completeReplay` remains a fragile private coupling.

The preferred future direction is a stable replay-complete event or public integration hook from the canonical panel flow. This should be done when panel evolution is intentionally allowed; it is not a reason to refactor the canonical panel during this compatibility-sensitive mission.

### 6. Bridge network evidence after the core incident semantics are stable

Accepted and implemented with a narrow observer seam.

`LdsNetwork` now exposes `subscribe(fn)`. Its existing fetch/XHR instrumentation remains the only network interceptor. The bridge subscribes to completed legacy network entries and emits privacy-minimized UREP `NETWORK_COMPLETED` evidence.

The bridge deliberately excludes before the EvidenceStore privacy boundary:

- full URL,
- query string,
- request body,
- decoder output,
- raw network error text.

Network completion enriches the rolling evidence timeline but does not independently freeze an incident in Mission 09.5.

---

## Feedback deliberately not taken as proposed

### 1. "Port perf.js" as the slow-render source

Not taken literally because it conflates two different measurements.

The legacy `perf.js` measures component TTI from `connectedCallback` to first `updateComplete`. It records a legacy slow-render entry when that first-render path exceeds 500 ms.

The UREP Lit adapter measures individual update duration from `performUpdate` start to completion and emits it as `UPDATE_COMPLETED.payload.durationMs`.

These signals answer different questions:

- UREP `UPDATE_COMPLETED.durationMs`: how long did this Lit update take?
- legacy `perf.js`: how long from component connection to first committed render?

Therefore slow update analysis uses UREP directly. If legacy perf is bridged later, it must preserve explicit first-render/TTI semantics rather than duplicating `UPDATE_COMPLETED` as another "slow render" event.

### 2. Add `analyzeIncident()` public API now

Deferred.

The current product flow is intentionally evidence-driven:

`EvidenceStore -> IncidentFlightRecorder -> EvidenceGraph -> RootCauseGrouper -> EvidenceCapsule -> existing panel`

A public imperative analysis API would add contract surface without a demonstrated consumer. It should be introduced when another real integration needs programmatic incident analysis, not pre-emptively.

### 3. Refactor prototype mutation immediately

Deferred.

The bridge is guarded, small, and exists specifically to avoid modifying the restored canonical panel while still proving product integration. Replacing it now would expand the mission and risk panel compatibility.

It is tracked as debt and should be removed at a deliberate panel-integration milestone.

### 4. Start Mission 10 / Vue now

Rejected for this checkpoint.

Mission 09.5 still needs real executable/browser validation. Starting another framework before validating the Lit integration would repeat the pattern this project is explicitly trying to avoid: breadth before verified closure.

---

## Refined Mission 09.5 continuation — implemented

The continuation was intentionally compact:

1. Generalize intelligence analysis beyond errors.
2. Add UREP-native slow Lit update analysis with a configurable 500 ms default.
3. Preserve runtime-error priority by keeping slow updates non-freezing.
4. Restore opt-in intelligence recorder/panel behavior.
5. Add slow-path, later-error, below-threshold, gate, cluster-strength, and tie-break regression tests.
6. Bridge network completion through the existing collector using a subscriber seam rather than duplicate interception.
7. Keep the canonical `LdsDebugPanel.js` untouched.
8. Keep replay private-method wrapping explicitly transitional.
9. Stop before Mission 10/Vue and require an executable/browser validation checkpoint.

---

## Mission efficiency rule

For future missions and review cycles:

- code/tests first,
- documentation should explain decisions, not substitute for implementation,
- prefer one mission commit, but use a few focused commits when that materially improves risk isolation,
- do not add public API without a real consumer,
- do not introduce a second diagnostics product beside the existing LDS panel,
- do not duplicate evidence already emitted by a framework adapter,
- preserve baseline compatibility unless an intentional migration explicitly changes it,
- stop expanding scope once acceptance criteria are met,
- use independent review at strategic checkpoints, not as a reason to churn working code.

A useful additional invariant from this review cycle:

> Lower-severity diagnostic symptoms must never suppress higher-severity evidence. Performance analysis must not consume the recorder needed for crash capture.

---

## What Claude should review next

Review the exact current `main` commit, not an earlier SHA. Focus on:

1. whether opt-in intelligence startup preserves previous gate semantics,
2. whether slow-update snapshot analysis is correct and cannot suppress later runtime errors,
3. whether the 500 ms default is acceptable as compatibility behavior while remaining configurable,
4. whether the network `subscribe()` seam preserves legacy network behavior and avoids duplicate instrumentation,
5. whether the network bridge is sufficiently privacy-minimized,
6. whether root-cause confirmed-strength and tie-break tests accurately lock the intended contract,
7. whether the canonical panel remains byte-identical and package/build compatibility remains intact,
8. whether any executable tests/build/browser checks fail at the exact reviewed commit.

Do not recommend Mission 10/Vue until the Mission 09.5 executable/browser closure gate is satisfied, unless there is a concrete reason to change that gate.

---

## Validation honesty

The GitHub connector can inspect and mutate the repository but does not provide an executable working tree in this session. Therefore commits, source contracts, and static regression intent can be verified here, but `npm test`, build output, and browser behavior must not be claimed as executed unless they are run in an environment that actually executes the repo.

If Claude has an executable checkout and reports test results, treat those as reviewer evidence. They still should be reconciled with the exact reviewed commit SHA.
