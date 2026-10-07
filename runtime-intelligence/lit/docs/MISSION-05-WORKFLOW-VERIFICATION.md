# Mission 05 — Generic Baseline + Compare + Verify + Evidence Capsule

Status: COMPLETE

## Delivered

- `src/core/workflow-verification.js`
  - framework-neutral workflow run snapshots from UREP/incident events;
  - explicit healthy baseline promotion;
  - deterministic run comparison without causal interpretation;
  - built-in event-count metrics plus declarative custom numeric metrics;
  - fix verification with explicit target direction and absolute/relative thresholds;
  - `causality-confirmed` only when an applied intervention is followed by meaningful improvement on a distinct replay of the same workflow;
  - explicit inconclusive, not-confirmed and regressed outcomes;
  - custom metrics cannot overwrite built-in verification metrics.

- `src/core/evidence-capsule.js`
  - `RUF Evidence Capsule` v1 portable investigation object;
  - problem, trigger, owner, source, evidence references, root cause, causal chain, attribution, recommendation, verification, environment and AI prompt;
  - immutable JSON-serializable output;
  - raw runtime payloads omitted;
  - raw trace/interaction identifiers omitted while retaining context-presence flags;
  - source locations reuse Mission 03 sanitization before export;
  - generated AI handoff prompt explicitly preserves evidence-level honesty.

- focused unit tests and public exports from `src/index.js`.

## Product model

```text
incident / workflow run
        ↓
normalized run snapshot
        ↓
healthy baseline or before-fix run
        ↓
measurement-only comparison
        ↓
explicit intervention + replay + target criterion
        ↓
verify
  ├─ confirmed
  ├─ not-confirmed
  ├─ regressed
  └─ inconclusive
        ↓
portable Evidence Capsule
```

## Confirmation law

Comparison never proves causality by itself.

`causality-confirmed` is emitted by verification only when all are true:

1. the intervention is explicitly recorded as applied;
2. before/after are distinct runs;
3. both runs identify the same workflow;
4. the target metric is available in both runs;
5. the target changes in the declared improvement direction;
6. the change meets configured absolute/relative significance thresholds.

Metric improvement without these conditions remains correlation-level verification evidence.

## Baseline semantics

A baseline is an explicitly promoted workflow-run snapshot, normally representing known healthy behavior. Comparing against a baseline measures drift/regression; it does not automatically label the candidate unhealthy or causally explain the difference.

Built-in metrics include total events and `count:<event-type>` for the UREP vocabulary. Declarative custom metrics can filter by event type/owner and aggregate numeric payload fields using `count`, `sum`, `avg`, `min`, or `max`.

## Evidence Capsule privacy boundary

The Capsule is intentionally safer than dumping raw runtime events:

- no event payload values;
- no raw trace/interaction IDs;
- source URL/path fields are normalized through `sanitizeSourceFile`;
- only structural evidence references are exported by default.

This is still not the planned enterprise privacy/redaction layer. Problem text, environment metadata and other caller-supplied fields must be treated according to the later enterprise export policy.

## Validation

Focused Mission 05 tests were executed with Node's built-in test runner in an isolated ESM harness: 10 passed, 0 failed.

Coverage includes deterministic snapshots/custom metrics, baseline comparison, successful verification, intervention/workflow/run guards, threshold failure, regression, metric collision protection, incident-to-verification flow, immutable JSON Capsule output, payload/identifier omission and AI evidence-honesty guidance.

A full checked-out repository test execution is not claimed in the connector environment.

## Known limits

- A baseline currently represents one explicitly selected healthy run; statistical/multi-run baseline modeling is deferred.
- Verification is deterministic threshold-based logic, not statistical causal inference.
- Consumers define the target metric and meaningful-improvement threshold.
- Evidence Capsule has no HTML/report UI integration yet.
- Enterprise-wide value redaction/export policy remains a separate mission.

## Next mission

Mission 06 — Runtime Resource Ownership Ledger v2

Effort: HIGH

Goal: generically track acquisition/release of runtime resources against lifecycle owners so active resources that outlive their owners can become lifetime-violation evidence with framework-appropriate attribution strength.
