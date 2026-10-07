# FrameworkAdapter v2

## The inversion

### v1

```text
core → adapter.wrapRenderCycle()
core → adapter.hookRequestUpdate()
core → adapter.renderCompletePromise()
```

The core asks every framework to behave like Lit.

### v2

```text
Lit / React / Vue / Angular / Svelte adapter
                    ↓
          Universal Evidence Protocol
                    ↓
       framework-neutral intelligence
```

Adapters tell the core what happened and how certain that attribution is.

## Capability contract

Every adapter advertises support for:

- owner lifecycle
- update lifecycle
- update cause
- state change
- render timing
- source location
- reactive dependency
- resource ownership
- effect lifecycle

Support values are `deterministic`, `framework-reported`, `partial`, `inferred`, or `unsupported`.

This is an enterprise trust feature, not metadata decoration. Reports and AI prompts must not claim a capability stronger than the adapter advertises.

## Current Lit capability profile

| Capability | Lit v2 |
|---|---|
| Owner lifecycle | deterministic |
| Update lifecycle | deterministic |
| Update cause | framework-reported |
| State change | framework-reported |
| Render timing | deterministic |
| Source location | partial |
| Reactive dependency | partial |
| Resource ownership | partial |
| Effect lifecycle | unsupported |

## Compatibility strategy

The mature Lit debugger remains the reference product. Mission 1 is additive:

- existing globals remain unchanged;
- existing panel remains unchanged;
- existing collectors remain unchanged;
- v1 Lit helper methods remain on `LitAdapter` temporarily;
- `LitDebugMixin` now emits v2 lifecycle/update evidence directly.

Future missions should migrate collectors to produce/consume UREP incrementally, never as a big-bang rewrite.
