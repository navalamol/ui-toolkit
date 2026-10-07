# Mission 01 — FrameworkAdapter v2 + Universal Runtime Evidence Protocol

Status: CLOSED

## Implemented
- Universal Runtime Evidence Protocol (UREP) event envelope.
- Separate evidence level and attribution quality axes.
- Ordered framework capability contract.
- Bounded EvidenceStore.
- FrameworkAdapter v2 with no Lit-shaped lifecycle contract in the generic base.
- LitAdapter v2 emitting owner/state/update evidence.
- Lit legacy helper methods retained only as compatibility shims.
- LitDebugMixin additive integration.
- Generic event vocabulary for owner/state/dependency/update/resource/network/browser/navigation/error evidence.
- Unit coverage for protocol/store/capability/Lit adapter behavior.

## Evidence ladder
observation -> correlation -> attribution -> lifetime-violation -> retainer-confirmed -> causality-confirmed

This is independent of attribution quality: deterministic, framework-reported, source-attributed, temporal-inference, heuristic, unknown.

## Product rule
The advanced Lit implementation remains the gold-standard product reference. Generic/runtime work must preserve its Pinpoint, HTML/Fix Table/AI handoff, workflow verification, resource-lifetime and ui-platform depth rather than replacing it with generic telemetry.

## Deliberate non-goals
- Evidence graph/root-cause grouping.
- Source-map resolver.
- Incident flight recorder.
- Migration of every legacy Lit collector to UREP.
- Production React/Vue/Angular/Svelte adapters.
- Full enterprise redaction policy.

## Verification
No paid service or GitHub Actions were enabled. Protocol and adapter unit tests were added in `lit/test/unit/` and syntax/contract review was performed during implementation.

## Next
Mission 02: Evidence Graph + causal/root-cause grouping — HIGH effort.
