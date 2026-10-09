# Session 2026-10-08 — Changes Made and Current Status

## What this session did

This was an **independent strategic review session**, followed by implementation of approved changes.

### Phase 1: Strategic review

Claude reviewed the full runtime-intelligence codebase from five lenses (new developer, senior engineer, UI architect, product engineer, evidence honesty). The full review is recorded in the chat history. Key findings:

- Evidence honesty was broken: "Likely cause" shown even when evidence was only `correlated` (temporal proximity)
- Root-cause scoring rewarded structural ancestry (being high in the component tree) instead of actual causal links
- Two modules (`diagnostic-policy.js`, `resource-ownership-ledger.js`) had zero active pipeline callers
- `gate.js` had a regression: force-write lines executed before the SSR guard
- `panel-intelligence-presentation.js` patched a private `_completeReplay` method (fragile coupling)

### Phase 2: User direction

User confirmed:
- **Keep ReactAdapter and FrameworkAdapter active** — the system is generic (Lit, React, future Angular/Vue)
- **No deletions** — archive/ and future/ pattern instead
- Fix evidence honesty, scoring, and coupling issues

### Phase 3: Implementation

All changes listed in the file-change summary below were applied. **95 tests pass, 0 fail.**

---

## Critical: `gate.js` regression pattern

`gate.js` has a recurring bug where the force-write lines (JSDoc example code that became live code) appear in `_toolEnabled()` BEFORE the `typeof window === 'undefined'` SSR guard. This breaks SSR safety and force-enables all tools in every page.

The correct `_toolEnabled` starts with:
```js
function _toolEnabled(toolKey) {
    if (typeof window === 'undefined') return false;
    // Per-tool standalone flags — work without master flag
    if (toolKey === 'perf' && window.__LDS_PERF_ENABLED__) return true;
    ...
```

The incorrect pattern (DO NOT reintroduce) starts with:
```js
function _toolEnabled(toolKey) {
    window.__LDS_PERF_ENABLED__ = true      // ← live code, not docs!
    window.__LDS_INTELLIGENCE_ENABLED__ = true
    ...
    if (typeof window === 'undefined') return false; // ← too late, already threw
```

This bug was found, fixed, and fixed again in this session (the other AI reverted it between runs). **The next reviewer should check gate.js first** before running tests.

---

## File changes in this session

| File | Change |
|---|---|
| `src/archive/diagnostic-policy.js` | MOVED from `src/core/` |
| `src/archive/README.md` | NEW |
| `src/future/resource-ownership-ledger.js` | MOVED from `src/core/` |
| `src/future/README.md` | NEW |
| `src/index.js` | Export blocks for both modules commented out with `// DEFERRED` / `// ARCHIVED` |
| `src/core/gate.js` | Removed force-write lines; SSR guard moved to top of `_toolEnabled()` |
| `src/core/root-cause.js` | `_reachable()` split into `_causesReachable()` + `_structuralReachable()`; scoring formula updated |
| `src/integration/lit/developer-intelligence-summary.js` | `likelyCause` text is now strength-conditional |
| `src/integration/lit/panel-intelligence-presentation.js` | `_causeLabel()` helper; dynamic label in `_renderFinding()`; `_completeReplay` patch removed; `lds-replay-complete` listener added |
| `src/panel/LdsDebugPanel.js` | `_completeReplay()` dispatches `lds-replay-complete` CustomEvent |
| `test/unit/archive/diagnostic-policy.test.mjs` | MOVED from `test/unit/` |
| `test/unit/future/resource-ownership-ledger.test.mjs` | MOVED from `test/unit/` |
| `test/unit/audit-hardening.test.mjs` | Ledger import + tests commented out; `causality-confirmed` test added |
| `test/unit/package-integrity.test.mjs` | `RuntimeResourceOwnershipLedger` removed from named-export check |

---

## Test state

**Before this session:** 110 pass, 0 fail (but with pre-existing gate.js regression hiding in later commits)

**After this session:** 95 pass, 0 fail

The count dropped from 110 to 95 because:
- `test/unit/archive/` and `test/unit/future/` files are excluded from `test/unit/*.test.mjs` glob
- Archived: `diagnostic-policy.test.mjs` (~15 tests)
- Moved to future: `resource-ownership-ledger.test.mjs` (~2 tests in audit-hardening)

---

## What was NOT done (intentionally)

- Vue adapter — explicitly deferred
- More collectors — deferred until Lit value proven
- Network bridge improvements — deferred
- React adapter work — kept active but no new features added yet
- Resource-ownership-ledger reconnection — stays in `src/future/` until `memory.js` emits UREP resource events
