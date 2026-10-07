# Mission 01.1 — Foundation Hardening

Status: COMPLETE

## Goal
Make UREP safe to build an Evidence Graph on without expanding product scope.

## Delivered
- UREP schema 1.1 immutable evidence snapshots: payloads are cloned and recursively frozen, preventing later application mutations from rewriting historical evidence.
- Runtime-value capture semantics are explicit:
  - `bounded` preserves bounded primitive values and is **not redaction**;
  - `shape-only` hides primitive content and records type/shape metadata.
- Evidence confidence validation is explicit.
- EvidenceStore causal references have defined states: `present`, `evicted`, `unknown`.
- Store rejects unknown causal references and references that resolve to a non-earlier event.
- Eviction tombstones are themselves bounded by `maxEntries`; bounded operation is preserved.
- Lit owner identity distinguishes physical component instance from lifecycle connection:
  - `instanceId` stays stable for the same element;
  - owner `id` is unique for each connect/disconnect lifetime;
  - `lifecycleGeneration` increments on reconnect.
- Cross-framework protocol fixtures prove React, Vue, Angular, and Svelte signals fit the same generic vocabulary without adding framework-specific event names.
- Permanent engineering efficiency rules added at repository root.

## Verification
Focused Node 22 test run: **9 tests passed, 0 failed**.

Covered:
1. deep immutable/detached evidence snapshots;
2. bounded vs shape-only privacy semantics;
3. present/evicted/unknown references;
4. rejection of invalid causal references;
5. React/Vue/Angular/Svelte protocol fixtures;
6. capability strength ordering;
7. stable Lit physical identity + unique lifecycle identity;
8. causal Lit update ordering;
9. disconnect correlation cleanup.

## Important limitation
`shape-only` is a safer capture mode, not a complete enterprise privacy/redaction system. Header/URL/query/body/PII redaction remains a later dedicated mission.

## Next
Mission 02 — Evidence Graph + causal/root-cause grouping. Effort: HIGH.

The graph may now rely on immutable events, explicit reference state, lifecycle-stable owner identity, and framework-neutral fixtures.
