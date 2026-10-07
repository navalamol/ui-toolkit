# Pre-Mission-10 Legacy Runtime Hardening

Status: REVIEW FIX

This follow-up belongs to the pre-Mission-10 audit and addresses baseline-era runtime wrapper defects discovered after the first foundation hardening commit.

## Defects found

### Wrapper stacking across reconnects

`error-boundary`, `prop-audit`, and `cycle-detector` replaced instance methods during `attach()` but did not restore the originals during `detach()`.

A component that disconnected and later reconnected could therefore accumulate nested wrappers around:

- `performUpdate`
- `requestUpdate`
- `updated`

Consequences included duplicate diagnostics, extra call depth, stale closures and behavior that changed with each reconnect.

### Dropped requestUpdate arguments

The prop-audit and cycle-detector wrappers accepted only `(name, oldValue)` and called the wrapped method with only those two arguments.

Lit's optional third `requestUpdate` argument could therefore be lost whenever these diagnostics were enabled.

### Cycle detector changed synchronous semantics

The cycle detector wrapped `performUpdate` with an `async` function. A synchronous underlying method therefore became Promise-returning and kept the "currently updating" marker alive until a later microtask.

This could distort update timing/cycle attribution and unnecessarily change host behavior.

### Disconnect cleanup order could create false resource findings

`LitDebugMixin` attached diagnostics in one order but detached them in a different non-reversed order. In particular, memory/resource tracking detached before inspector and other diagnostics had removed their own listeners/resources.

That could cause diagnostic-owned resources to appear as surviving application resources during the lifetime check.

## Fix

- every wrapper now records whether the method originally existed as an own property and restores the exact pre-attach state;
- `requestUpdate` wrappers forward all arguments unchanged;
- cycle detection preserves synchronous return semantics and only returns a Promise when the wrapped method actually returns a thenable;
- `LitDebugMixin.disconnectedCallback()` detaches tools in strict reverse attach order;
- memory/resource cleanup is last, immediately before the Lit owner is disconnected from UREP.

## Regression coverage

`test/unit/legacy-wrapper-lifecycle.test.mjs` verifies:

- all `requestUpdate` arguments reach the original method;
- a synchronous `performUpdate` remains synchronous;
- detach restores prototype method lookup rather than leaving patched own properties;
- reconnect adds exactly one prop-audit record, proving wrappers did not stack.

This hardening changes diagnostics behavior only; it does not add new product features or advance Mission 10.
