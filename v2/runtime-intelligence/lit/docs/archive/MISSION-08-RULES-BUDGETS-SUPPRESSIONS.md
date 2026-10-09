# Mission 08 — Rules / Budgets / Suppressions

Status: COMPLETE

## Delivered

- `src/core/diagnostic-policy.js`
  - framework-neutral deterministic budget/rule engine;
  - explicit rule severity and scope;
  - metrics are supplied by existing runtime evidence or callers rather than inferred by the policy layer;
  - built-in event/evidence-level count metrics for UREP arrays;
  - pass / violated / unavailable / disabled evaluation states;
  - suppression by rule and optional framework / owner / workflow scope;
  - suppression expiry and required human reason;
  - suppressed violations remain recorded for auditability but are not actionable;
  - bounded finding history;
  - UREP-compatible diagnostic conversion without synthetic causal links;
  - duplicate rule/suppression protection.

- `test/unit/diagnostic-policy.test.mjs`
  - deterministic event metrics;
  - budget violation and passing behavior;
  - missing-metric handling;
  - active and expired suppressions;
  - scoped suppressions and rules;
  - evidence-semantic preservation;
  - non-causal diagnostic conversion;
  - bounded history;
  - duplicate ID rejection;
  - UREP event-count integration.

- public exports from `src/index.js`.

## Product model

```text
runtime evidence / normalized metrics
        ↓
deterministic policy rules
        ↓
budget evaluation
        ↓
pass | unavailable | violated
                  ↓
             severity
                  ↓
            suppression?
            ├─ yes → recorded + suppressed
            └─ no  → actionable finding
```

## Core law

**Rules classify evidence; they do not manufacture stronger evidence.**

A threshold breach proves only that the declared metric crossed the declared budget. It does not prove why that happened.

For example:

```text
12 component updates in one interaction
+
budget says > 10 is warning
=
deterministic budget violation

NOT
=
"state X caused a render storm"
```

`toEvidenceInput()` therefore emits a new policy diagnostic at:

```text
evidence.level       = observation
evidence.attribution = deterministic
confidence           = 1
```

This describes certainty about the **budget comparison**, not certainty about root cause. The diagnostic does not synthesize `causedByEventId`.

Original source events are referenced structurally through `sourceEventIds` and retain their original evidence level and attribution.

## Rule contract

`createBudgetRule()` requires:

- stable `id`;
- metric key;
- comparison operator (`>`, `>=`, `<`, `<=`, `==`);
- finite threshold;
- severity (`info`, `warning`, `error`, `critical`).

Optional scope may target:

- framework;
- owner ID;
- workflow ID.

No product-wide thresholds are hard-coded by Mission 08. Teams/framework adapters can define their own budgets later without changing the engine.

## Metrics

The engine accepts a flat numeric metric map so it can consume:

- Mission 05 workflow metrics;
- aggregated performance metrics;
- Resource Ledger counts;
- custom local collectors;
- built-in `createEventCountMetrics(events)` output.

Built-in UREP count keys include:

```text
count:event:<event-type>
count:event:total
count:evidence:<evidence-level>
```

If a required metric is missing/non-numeric, evaluation is `unavailable`; it is never silently treated as pass or failure.

## Suppressions

`createSuppression()` requires:

- stable suppression ID;
- human-readable reason.

Optional fields:

- `ruleId` (`*` means all rules);
- expiry timestamp;
- framework / owner / workflow scope;
- ticket/reference.

Suppression changes actionability only:

```text
violation exists = true
suppressed       = true
actionable       = false
```

The violation remains in bounded history so accepted risk/noise is still auditable.

Expired suppressions cannot hide new findings.

## Validation

Focused Mission 08 tests were executed with Node's built-in test runner in an isolated ESM harness:

**13 passed, 0 failed**

A full checked-out repository test execution is not claimed in the connector environment.

## Known limits

- Mission 08 is a local deterministic policy engine, not an organization/cloud policy service.
- There are no built-in opinionated product budgets yet.
- Metric collection remains the responsibility of existing evidence/collector layers.
- No persistent suppression store, RBAC, approval workflow or remote policy distribution.
- No UI/rule editor in this mission.
- Suppression reasons are runtime metadata; durable governance belongs outside this core.
- Rules do not perform statistical anomaly detection or ML.

## Next mission

Mission 09 — React Production Adapter

Effort: HIGH

Goal: prove the framework-neutral architecture against a second real framework by emitting honest React lifecycle/update/resource evidence through FrameworkAdapter v2 and the UREP pipeline, while respecting React's actual observability limits rather than imitating Lit semantics.
