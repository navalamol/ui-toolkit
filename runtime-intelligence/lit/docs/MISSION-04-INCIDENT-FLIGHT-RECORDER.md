# Mission 04 — Incident Flight Recorder

Status: COMPLETE

## Delivered

- `src/core/incident-flight-recorder.js`
  - framework-neutral recorder over an EvidenceStore-compatible subscription;
  - rolling evidence window bounded by event count and event age;
  - explicit states: running, pending-freeze, frozen, stopped;
  - manual incident freeze;
  - automatic freeze predicate for runtime incidents;
  - optional bounded post-trigger event capture before final freeze;
  - immutable incident snapshot metadata and event list;
  - resume/reset behavior for the next investigation window;
  - diagnostic predicate failures are isolated from application runtime.

- `test/unit/incident-flight-recorder.test.mjs`
  - count retention;
  - age retention;
  - manual freeze;
  - exact post-trigger capture;
  - automatic freeze;
  - auto-trigger failure isolation;
  - resume/new window;
  - frozen incident preservation after stop.

- public exports from `src/index.js`.

## Product model

```text
EvidenceStore / UREP
        ↓
rolling bounded window
        ↓
incident trigger
        ↓
optional N post-trigger events
        ↓
immutable frozen incident
        ↓
Evidence Graph / Root Cause / Source Resolver / later Evidence Capsule
```

The recorder is intentionally not another collector. Framework/browser adapters continue to emit UREP evidence into the existing evidence pipeline; the recorder only preserves the relevant temporal window around a failure.

## Important invariants

1. Recording does not modify evidence level, attribution quality, correlation or source information.
2. Automatic trigger predicates are diagnostic code and may never break the host application.
3. Frozen incidents stop accepting new events until explicitly resumed.
4. The rolling window remains bounded by both count and age.
5. Post-trigger capture is event-count based in this mission so completion is deterministic and does not require timers/background work.

## Privacy boundary

The recorder stores already-normalized immutable UREP events. It does not inspect/enrich payload values and does not claim to provide enterprise redaction.

This avoids creating a second privacy model. The dedicated enterprise privacy/redaction mission remains responsible for value-level policies before broad export/distribution.

## Validation

Focused Mission 04 tests were executed with Node's built-in test runner in an isolated ESM harness: 8 passed, 0 failed.

A full checked-out repository test execution is not claimed in the connector environment.

## Known limits

- One active/frozen incident per recorder instance; no incident history store yet.
- Post-trigger capture is by event count, not elapsed milliseconds.
- No automatic default trigger policy is imposed by the core; consumers decide which errors/diagnostics merit freezing.
- No panel/report/Evidence Capsule integration yet.
- No persistence or session replay; this remains a bounded in-memory evidence recorder.

## Next mission

Mission 05 — Generic Baseline + Compare + Verify + Evidence Capsule

Effort: HIGH

Goal: formalize healthy workflow baselines, compare incident/fix runs, verify whether an intervention actually improved the target issue, and package the evidence into a portable Evidence Capsule without overstating causality.
