# Claude Handoff — Mission 01

Read `MISSION-01-FRAMEWORK-ADAPTER-V2.md`, `architecture/UNIVERSAL-EVIDENCE-PROTOCOL.md`, and `architecture/FRAMEWORK-ADAPTER-V2.md` first.

## Challenge this work, do not merely extend it

Questions Claude should actively attack:

1. Is the event vocabulary genuinely framework-neutral, or are hidden Lit assumptions still present?
2. Are evidence level and attribution quality sufficient as two axes, or is a third concept (for example data provenance) necessary?
3. Are capability support values too coarse for React/Vue/Angular/Svelte realities?
4. Can event correlation IDs be introduced without AsyncLocalStorage-like browser complexity or global mutable context bugs?
5. Should resource ownership become part of the same evidence stream or remain a dedicated ledger feeding evidence later?
6. Can the protocol represent Vue reactive dependency triggers and Svelte effect traces without framework-specific event names? Mission review added `dependency.triggered` for this reason.
7. Is `retainer-confirmed` correctly placed between lifetime violation and causality confirmation for future heap/CDP evidence?

## Non-negotiables

- Runtime evidence outranks model confidence.
- Correlation must not be described as causality.
- Lit remains the gold-standard adapter, but the core must not inherit Lit lifecycle semantics.
- React/Vue/Angular/Svelte adapters should emit the same envelope while honestly reporting weaker/stronger attribution.
- New generic capabilities should ideally benefit two or more framework families.
- Keep the runtime local-first and bounded; do not add a cloud dependency to make the core work.

## Mission review outcome

The first implementation was accepted with one hardening correction: UREP now explicitly models `retainer-confirmed` evidence and generic dependency-trigger, browser-frame, and navigation events. These are foundational for later engine-level proof, Vue/Svelte causality, and browser execution correlation.

## Recommended next work

Mission 02: **Evidence Graph + causal/root-cause grouping** — HIGH effort.

The key challenge is not drawing a graph. It is creating edges that carry their own evidence/attribution strength so Pinpoint can group symptoms without inventing causality.
