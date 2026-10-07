# Mission 09 — React Production Adapter

Status: COMPLETE + HARDENED

## Goal

Prove the framework-neutral runtime intelligence architecture against React without forcing React to imitate Lit semantics.

The adapter is dependency-free at runtime and uses only public/explicit integration points.

## Delivered

- `src/adapter/react/ReactAdapter.js`
  - stable opaque instance tokens with lifecycle generations;
  - explicit mount/unmount evidence;
  - React Profiler-compatible callback bridge;
  - explicit update-request and state-change instrumentation;
  - effect lifecycle diagnostics;
  - resource acquire/release evidence compatible with Mission 06;
  - capability resolver for downstream certainty capping;
  - no React Fiber/private internals;
  - no React monkey-patching;
  - no runtime dependency on `react` or `react-dom`.

- `test/unit/react-adapter.test.mjs`
  - lifecycle isolation;
  - Profiler timing;
  - structural single-request parenting;
  - batched/concurrent ambiguity;
  - state/resource attribution honesty;
  - resource cleanup after disconnect;
  - effect lifecycle;
  - capability resolver behavior;
  - fail-closed invalid tokens;
  - diagnostics callback isolation.

- package/barrel exports from the initial Mission 09 commit remain unchanged.

## React integration model

A React application owns the React APIs. The adapter only receives signals.

Typical component identity:

```js
const runtimeToken = useRef({});

useEffect(() => {
  reactAdapter.connect(runtimeToken.current, {
    name: 'ProductEditor',
    source: { file: '/src/ProductEditor.jsx' },
  });

  return () => reactAdapter.disconnect(runtimeToken.current);
}, []);
```

Profiler integration:

```js
const onRender = reactAdapter.createProfilerCallback(runtimeToken.current);
```

The callback is compatible with React Profiler's public `onRender` shape.

## Capability model

Default:

```text
owner-lifecycle       partial
update-lifecycle      partial
update-cause          unsupported
state-change          partial
render-timing         partial
source-location       partial
reactive-dependency   unsupported
resource-ownership    partial
effect-lifecycle      partial
```

When constructed with:

```js
new ReactAdapter({ profilingEnabled: true })
```

`render-timing` becomes `framework-reported`.

### Why update-cause is unsupported

The adapter may observe:

```text
instrumented update request
        ↓
later React Profiler commit
```

but React concurrency and batching mean that this does not prove one-to-one causality.

With one pending request, the adapter may use:

```text
parentEventId = request event
```

as structural context.

It never synthesizes:

```text
causedByEventId
```

For multiple pending requests, it does not choose one parent.

## Mission 09 hardening

The initial implementation had one unsafe certainty path:

```text
explicit resource wrapper
→ deterministic attribution
```

while adapter-wide resource ownership was only:

```text
resource-ownership = partial
```

That could become unsafe if Mission 06 were used without the adapter capability resolver.

The hardened adapter now fails safe at the event level:

```text
explicit instrumentation + no source
→ attribution = unknown

explicit instrumentation + source location
→ attribution = source-attributed
```

This applies to state, resource and effect instrumentation.

The adapter may still expose a capability resolver, but correctness no longer depends on every consumer remembering to install it.

## Evidence law

React-specific instrumentation follows the same project rules:

```text
Profiler timing
→ framework-reported timing fact

instrumented update request
→ observed scheduled/requested work

single pending request
→ structural parent context only

state observation before commit
→ not render causality

resource wrapper observed acquisition
→ explicit local fact
→ not framework-wide deterministic ownership

resource active after owner cleanup
→ Mission 06 determines violation certainty
```

Observability limits cap claims.

## Profiler safety

`createProfilerCallback()` isolates diagnostics failures:

```text
diagnostic store failure
≠
React onRender failure
```

The callback returns `null` on diagnostic failure instead of throwing into the host rendering path.

Direct explicit adapter calls remain normal API calls and may surface configuration/programming errors.

## Resource ownership

Resources still use standard UREP events:

```text
resource.acquired
resource.released
```

Late release remains recordable after owner disconnect so React cleanup ordering does not silently lose cleanup evidence.

The adapter-level capability remains:

```text
resource-ownership = partial
```

and the Resource Ownership Ledger can additionally use:

```js
reactAdapter.createCapabilityResolver()
```

for framework-level certainty capping.

## Strict Mode / reconnect behavior

The same opaque token keeps its physical instance identity while each reconnect receives a new lifecycle generation:

```text
react-7-life-1
react-7-life-2
react-7-life-3
```

This keeps separate ownership windows from collapsing together.

## Production-safety decisions

Mission 09 deliberately does not use:

- Fiber traversal;
- React DevTools global hooks;
- renderer internals;
- scheduler monkey-patching;
- patched hooks;
- patched `createElement`;
- automatic dependency introspection.

## Validation

Focused hardened Mission 09 suite:

**16 passed, 0 failed**

The tests run with Node's built-in test runner in an isolated ESM harness and intentionally do not import React.

A full checked-out repository test run and browser React application integration run are not claimed in the connector environment.

## Known limits

- Application boundaries must opt into instrumentation.
- Standard React production builds may not expose Profiler timing unless profiling support is enabled.
- Profiling has overhead and should be enabled selectively.
- Concurrent rendering prevents reliable one-request-to-one-commit causal mapping.
- Hook dependency causality is unsupported.
- Server Components / server-rendering lifecycle are outside this client adapter.
- Final generic package/repository naming is separate from this adapter mission.

## Architecture proof

```text
Lit Adapter ───┐
               ├─→ UREP → Privacy → Evidence Graph → Root Cause
React Adapter ─┘                ↓
                         Recorder / Verify
                         Ledger / Rules
                         Evidence Capsule
```

The same downstream intelligence stack now accepts a second framework while preserving framework-specific evidence limits.

## Next mission

Mission 10 — Vue Production Adapter

Effort: MEDIUM-HIGH

Goal: add Vue support using public lifecycle/watch/performance integration points while preserving the same capability-honesty rules.
