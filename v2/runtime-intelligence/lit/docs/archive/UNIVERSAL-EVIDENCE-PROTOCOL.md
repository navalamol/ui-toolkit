# Universal Runtime Evidence Protocol v1

## Why this exists

The first `FrameworkAdapter` contract accidentally described Lit rather than frontend runtimes: `requestUpdate`, `updated`, `updateComplete`, and declared Lit properties. That makes every future adapter imitate Lit and encourages false certainty.

UREP inverts the dependency. Framework adapters **emit neutral evidence**. The intelligence layer consumes that evidence without knowing whether it came from Lit, React, Vue, Angular, Svelte, Web Components, or plain browser instrumentation.

## Stable event envelope

```text
RuntimeEvidenceEvent
├─ schemaVersion
├─ id / sequence / timestamp
├─ type
├─ framework { name, version, adapterVersion }
├─ owner { id, kind, name, instanceId, parentId }
├─ source { file, line, column, functionName }
├─ correlation { traceId, interactionId, parentEventId, causedByEventId }
├─ evidence { level, attribution, confidence }
└─ payload
```

## Two independent truth axes

**Evidence level** answers: *how far has the investigation progressed?*

`observation → correlation → attribution → lifetime-violation → causality-confirmed`

**Attribution quality** answers: *how did we learn this specific fact?*

`deterministic | framework-reported | source-attributed | temporal-inference | heuristic | unknown`

These must never be collapsed. A React temporal correlation and a Lit `requestUpdate(name, oldValue)` can share an event type without pretending to have the same certainty.

## Universal event vocabulary in v1

- `owner.created`, `owner.destroyed`
- `interaction`
- `state.changed`
- `component.update.requested`, `.started`, `.completed`
- `resource.acquired`, `resource.released`
- `network.started`, `network.completed`
- `error`
- `diagnostic`

The vocabulary is deliberately small. New event types require a cross-framework justification; framework-specific detail belongs in `payload` or an adapter plugin.

## Privacy default

The protocol does not retain raw object graphs for state values. `summarizeRuntimeValue()` records bounded type/shape summaries. Raw-value capture, if ever added, must be explicit and redaction-aware.

## Compatibility

LitAdapter v2 still exposes the old helper methods temporarily so existing LDS collectors are not broken. They are compatibility shims only and are **not** part of the v2 neutral contract.
