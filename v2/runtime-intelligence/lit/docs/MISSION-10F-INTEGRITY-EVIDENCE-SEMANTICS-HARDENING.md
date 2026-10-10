# Mission 10F — Integrity + Evidence Semantics Hardening

## Goal

Protect developer trust by ensuring Runtime Intelligence never upgrades timing proximity into causality, never floods its own evidence stream, and continues from Claude's narrowed strategic-review topology.

## Existing strategic decisions preserved

- Confidence-aware wording is already active: correlated -> **Strongest signal**, attributed -> **Likely cause**, confirmed -> **Confirmed cause**.
- Root-cause scoring already heavily discounts structural `PARENT` ancestry versus explicit `CAUSES` reachability.
- `diagnostic-policy.js` remains archived.
- `resource-ownership-ledger.js` remains future/deferred.
- Lit is required package metadata, not an optional peer.

## Change A — Network/state evidence honesty

Temporal proximity alone is correlation.

A `NETWORK_COMPLETED` event receives a trace identifier at the network evidence capture boundary. `NetworkStateCorrelator` reuses that trace when a nearby `STATE_CHANGED` event is observed and emits a correlation diagnostic.

It MUST NOT set `causedByEventId` from the network event.

Expected graph semantics:

```text
network + nearby state
  -> TRACE_CONTEXT: allowed
  -> CAUSES from network event: forbidden
```

Only future explicit callback/setter instrumentation may upgrade this relationship to attribution/causality.

## Change B — Update-budget episode debounce

One continuous over-budget burst should create one actionable diagnostic, not a diagnostic for every subsequent update.

```text
under budget
  -> threshold crossed: emit once, mark violating
  -> still over budget: no new diagnostic
  -> rolling window recovers: clear violating
  -> threshold crossed later: emit a new episode
```

## Change C — canonical status

`docs/STATUS.md` is the single current-state summary. Historical handovers and mission documents remain context but must not override it.

## Tests

- Network capture has a `net-trace-*` trace id.
- Correlation diagnostics share the trace id.
- Temporal network/state diagnostics have no `causedByEventId`.
- Evidence graph contains trace context but no causal edge outgoing from the network event.
- Continuous budget breach emits exactly one diagnostic.
- Recovery re-arms the monitor and a later breach emits one new diagnostic.
- Lit remains a required peer dependency.

## Validation result

Focused 10F suite: 35/35 passing in the reviewed v2 snapshot.

Dedicated Mission 10F regression suite: 3/3 passing.

The uploaded ZIP itself omits repository assets including the React adapter/baseline guides, so full local package validation of that ZIP is not treated as authoritative for the dedicated repository. Those existing repository assets are preserved during sync.
