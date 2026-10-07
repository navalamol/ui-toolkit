# Mission 02 — Evidence Graph + Root-Cause Grouping

Status: COMPLETE

## Delivered

- `src/core/evidence-graph.js`
  - builds graph nodes from UREP events;
  - explicit `causedByEventId` => causal-shaped edge backed by the target event's evidence;
  - explicit `parentEventId` => structural lineage edge;
  - shared `interactionId` / `traceId` => correlation-only context edges;
  - every edge records relation, basis, inferred flag, evidence level, attribution quality and confidence;
  - enforces earlier -> later chronology for all graph edges;
  - supports descendants and connected components for later Pinpoint/report use.

- `src/core/root-cause.js`
  - groups connected evidence into diagnostic clusters;
  - ranks likely root candidates;
  - collapses downstream symptoms by type/count;
  - labels cluster certainty as `confirmed`, `attributed`, or `correlated`;
  - certainty is derived from edge evidence, not merely from a causal-shaped relationship;
  - never upgrades correlation-only or observation-grade evidence into attribution.

- `test/unit/evidence-graph.test.mjs`
  - explicit causality vs structural lineage;
  - context correlation remains inferred;
  - future cause rejected;
  - late interaction markers cannot create backwards edges;
  - downstream symptoms collapse under attributed state change;
  - correlation-only clusters remain correlated;
  - observation-grade `causedByEventId` does not become attributed.

## Product rule

The graph is evidence, not decoration. A connection must explain why it exists and how strongly it is supported.

```text
explicit causedByEventId  -> causal-shaped edge carrying event evidence
explicit parentEventId    -> structural edge
shared interaction/trace  -> correlation-only edge
```

A relationship name is not proof strength. Root-cause ranking is a diagnostic hypothesis layer and must never override the evidence carried by graph edges.

## Known limits

- No source-map resolver yet.
- No graph UI/panel integration yet.
- Root scoring is deterministic heuristic ranking, not ML.
- Context edges use shared trace/interaction identity only; arbitrary temporal adjacency is intentionally not linked.
- Existing collectors still need progressive migration to emit richer interaction/trace correlations.

## Next mission

Mission 03 — Generic Source Resolver / source-map attribution

Effort: MEDIUM-HIGH

Goal: resolve runtime stacks and framework source hints into canonical `file:line:column` locations reusable by Pinpoint, Evidence Graph, Fix Table, HTML reports and AI handoff.
