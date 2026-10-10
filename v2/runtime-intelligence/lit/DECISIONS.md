# DECISIONS.md — Runtime Intelligence

> Priority filter and architectural decisions. Read before proposing or building anything.

---

## Priority stack

**70/20/10 rule:** 70% of effort goes to work that moves the north star metric. 20% goes to
infrastructure quality (tests, architecture, evidence fidelity). 10% maximum on exploration.

When in doubt: does this help a developer find the root cause faster? If no → defer.

---

## The 70/20 filter (run every feature through this)

Ask two questions:
1. Does a developer using this in a real session reach root cause faster?
2. Is there a real UI Platform page where this fires correctly today?

If both answers are no → defer. If one answer is no → ship a stub and validate first.

---

## Current priority order

1. **P0 browser validation** — Gate. Nothing else ships until Intelligence tab is verified in
   a real Lit app with `npm link` into UI Platform.
2. **Signal quality** — Verify Intelligence advisors produce no false positives in 3 sessions.
3. **Opportunities signal audit** — Worker and Idle advisors have weak signals. May be cut
   after P0 if they produce noise.
4. **React wiring** — Only when a React consumer project exists. Adapter is written; pipeline
   wiring is ~1 day. Don't wire until there's a consumer to validate against.
5. **Vue adapter** — After React is validated.
6. **New features** — After north star metric is measurably met.

---

## Architectural decision log

| # | Decision | Context | Tradeoff |
|---|---|---|---|
| 1 | `src/core/` is framework-neutral | Need Lit + React + Vue to reuse the same analyzers | Core has zero framework imports. Test overhead for isolation |
| 2 | Evidence Store is bounded (maxEntries) | Memory safety in long-lived sessions | Oldest events dropped; short incidents stay intact |
| 3 | Evidence Ladder is explicit enum | Prevents conflating correlation with causality | More verbose emit calls; forces honest classification |
| 4 | Intelligence tab frozen on incident | Prevent live-updating from overwriting a captured bug | Two captures = two separate sessions; no auto-replay |
| 5 | Opportunities tab always shows 5 sections | Empty state gives confidence advisors are active | Section visible even when nothing detected |
| 6 | `normalizeOwner()` strips `tag` field | Prevent owner tag from leaking stale state | Advisors must use `owner.name`, not `owner.tag` |
| 7 | Panel presentations patch the prototype | Avoid modifying `LdsDebugPanel.js` directly | Two patches (Intelligence + Opportunities) must coordinate |
| 8 | Advisors emit to Evidence Store as DIAGNOSTIC | Reuse existing store subscription mechanism | DIAGNOSTIC events need explicit payload guards |
| 9 | `gate.js` first line: SSR guard | Tool loaded server-side breaks without it | Every `_toolEnabled()` check must start with the SSR guard |
| 10 | Mission docs stay in `docs/` | Future Claude sessions need context on past decisions | Move to archive after mission completes |

---

## Deferred features (not now, not never)

| Feature | Why deferred | Revisit when |
|---|---|---|
| Memory leak detector | Strong signal only in long sessions; hard to validate | P0 passes + 3 validated sessions |
| Cross-component timing waterfall | Nice to have; adds complexity; weak north star impact | React is wired + consumer feedback |
| Network correlation strength score | Current binary sufficient; scoring adds tuning burden | Worker advisor validated in real app |
| Automated screenshot on incident | Browser security restrictions; implementation cost high | Demand from real users |
| Standalone DevTools panel | Distribution complexity; LDS panel is the right host now | Distribution path decision made |
| Export incident as JSON | No consumer for the JSON yet | CI integration request received |
