# Claude Handover Index

This folder closes the ChatGPT development phase and hands the Runtime Intelligence work to Claude for independent review.

Development is intentionally **stopped at this point**. Claude should review first and should not automatically continue the current direction.

## Read in this order

1. `CLAUDE-COMPLETE-HANDOVER-PROMPT.md`
   - Primary prompt to give Claude
   - User intent, product philosophy, current concerns, review questions, validation expectations, and explicit decision freedom

2. `IMPLEMENTATION-AND-DECISION-HISTORY.md`
   - Detailed technical/product KT
   - What ChatGPT built and why
   - Architecture, Lit integration, evidence pipeline, UX changes, real-app feedback, known weaknesses, and validation honesty

3. `FUTURE-WORK-AND-STRATEGIC-REVIEW.md`
   - Previously discussed future work
   - Alternative product directions
   - Real-app experiments, runtime-overhead review, and product success gate
   - Backlog only; nothing is pre-approved

Older handover/review material in this folder or under `lit/docs/` may also be useful for chronology, but the three files above are the current canonical KT set.

## Current user position

The user is **not** declaring the work technically wrong or useless.

The current assessment is:

- the architecture may become valuable for selected future scenarios
- immediate differentiated value is not yet convincing
- a reported root-cause candidate did not look relevant in at least one real UI Platform scenario
- implementation/file/concept count feels high relative to visible product benefit
- the original toolkit had a stronger simplicity/value ratio: one integration path, one panel, clear tabs, obvious value
- further implementation should stop until an independent review determines what should be kept, simplified, reworked, deferred, or removed

## Current product surface

The mature baseline LDS panel remains the main product surface.

Runtime Intelligence currently appears as a dedicated:

```text
✨ Intelligence
```

tab rather than a global banner.

Its intended developer answer is:

```text
Problem
Likely cause
Where
Impact
Do next
Confidence
Verification
```

However the accuracy and practical value of that interpretation are **not yet proven**.

## Important stop rule

Claude's first mission is review and recommendation, not feature implementation.

Do not automatically implement:

- Vue or more framework adapters
- more collectors
- more UREP bridges
- richer causal visualization
- additional architecture

until current Lit/UI Platform value is demonstrated.

## Baseline protection

Do not destabilize the working baseline areas:

- `lit/src/panel/LdsDebugPanel.js`
- Pinpoint
- Perf
- Vitals
- Network
- Falcor
- Memory
- Events
- Errors
- workflow baseline/replay
- resource-lifetime diagnostics
- HTML/JSON report export
- `lit/custom/ui-platform/`

## Key recent commits

- `65b9bd54a2d6b5a680ff3b483083fd63a7011222` — simple Runtime Intelligence usage guide
- `db736ed43127a07f386b1000f2607f01ab834d43` — compact developer-facing intelligence contract
- `f90dfd1259962cd7b9483a4af1ca5a2207ad0750` — banner visibility fix attempt
- `99662002b5d91050828ecd478f82a7b2c663c6bd` — moved Runtime Intelligence into dedicated panel tab
- `dd9c967fced8c495aafc4b3dfe4bf67037ec8a46` — dedicated-tab documentation
- `b43e9cf22be6eeea5b733336b8b6bb7f704596fb` — dedicated-tab regression guard
- `0d091a739726df9b4cb2afdec0e0533ad198c425` — complete Claude handover prompt
- `1ff21d152f28e645162c1a948e62c9347737ce79` — implementation and decision history
- `6e6698198622ab8aa1bf492bbd1b5250954c938c` — future work and strategic review queue

## Expected Claude outcome

Before significant code changes, Claude should recommend one of these directions:

```text
continue current direction
narrow to deterministic intelligence
merge Intelligence into Pinpoint
keep internals but hide/defer the product surface
simplify/remove selected architecture
revert most Intelligence product work
```

The recommendation should be based on real UI Platform debugging value, root-cause accuracy, runtime overhead, maintainability, and simplicity — not preservation of previous effort.

## Core instruction

Do not preserve ChatGPT's work for its own sake.

Keep, simplify, merge, rework, defer, or remove pieces based on demonstrated debugging value, correctness, runtime safety, and maintainability.

## Core success criterion

The feature is worth keeping only if a developer can truthfully say:

> It found or explained something important faster than the existing panel and browser DevTools, and I understood the answer immediately.
