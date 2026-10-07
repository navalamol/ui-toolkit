# Claude Complete Handover Prompt — Runtime Intelligence / Lit Debug Suite

Use this prompt as the starting instruction for Claude Code / Claude when taking over `Amonaval/runtime-intelligence`.

---

You are taking over an existing runtime-debugging project. Do **not** assume the current direction is correct just because a lot of architecture has been implemented. Your role is first to understand, validate, simplify, and decide what is actually worth keeping.

Repository: `Amonaval/runtime-intelligence`
Primary active package: `lit/`
Primary consumer / real application: UI Platform / Syndigo Main Platform, where hundreds of Lit/RufElement components consume this package through a shared base element and local `npm link` during development.

## 1. User intent and product philosophy

The user originally had a mature Lit/RUF debugging toolkit with a very strong product characteristic:

- one package
- one shared base integration point
- one debug flag or small set of opt-in flags
- one panel
- several clear tabs such as Pinpoint, Perf, Vitals, Network, Memory, Events, Errors, Falcor
- each tab offered visible, immediately understandable value
- minimal changes required in the real application

The user values practical runtime debugging that a UI engineer can understand immediately. The user does **not** want architecture for architecture's sake.

The strongest product constraint is:

> The tool must feel simpler than the problem it is helping debug.

A developer should not need to understand evidence graphs, runtime protocols, correlation IDs, event IDs, root-cause scores, or forensic internals to use the product.

## 2. What ChatGPT implemented

ChatGPT introduced a generic Runtime Intelligence architecture on top of the baseline toolkit. Major concepts include:

- framework-neutral `FrameworkAdapter`
- `LitAdapter`
- `ReactAdapter`
- Universal Runtime Evidence Protocol (UREP)
- bounded `EvidenceStore`
- `EvidenceGraph`
- `RootCauseGrouper`
- source resolution and attribution metadata
- bounded `IncidentFlightRecorder`
- Evidence Capsule export
- privacy / enterprise-safe evidence boundaries
- diagnostic policy abstractions
- resource ownership / lifetime primitives
- Lit runtime intelligence pipeline
- network completion bridge into UREP
- verification handoff from panel replay
- compact developer-facing intelligence summary
- dedicated `✨ Intelligence` tab in the existing panel

The intention was to evolve from separate measurements into a higher-level answer:

```text
raw runtime signals
        ↓
UREP evidence
        ↓
correlation / graph
        ↓
root-cause candidate
        ↓
compact developer interpretation
        ↓
Intelligence tab
```

The desired product answer was supposed to be:

```text
Problem
Likely cause
Where
Impact
What to do next
Confidence
```

rather than exposing raw forensic data.

## 3. Current user feedback — treat this as critical product truth

The user tested the work inside the actual UI Platform application.

Observed outcome:

- backend/global intelligence objects were present and evidence flowed
- the initial public intelligence model was far too technical and verbose
- evidence contained many opaque `evt-*` IDs and large reference arrays
- user could not understand what the data was for
- a compact presentation layer was then added
- a banner implementation flashed/disappeared because it was injected into Lit-managed panel DOM
- this was reworked into a dedicated `✨ Intelligence` tab
- the user now sees the tab, but a reported "root cause" did not look relevant
- immediate visible value still feels low compared with the number of files/concepts introduced
- the user is not saying the architecture is necessarily wrong; they are saying it is **not yet meaningfully proven or compelling in day-to-day use**

Important user conclusion:

> Stop development for now. Hand everything to Claude. Claude should independently decide what is useful, what should be reworked, and what should be removed or deferred.

Do not defend existing architecture. Evaluate it.

## 4. Your first mission is review, not implementation

Before changing code, perform a deep but practical review from multiple viewpoints:

1. New UI developer — can they understand what each feature does in under a minute?
2. Senior frontend engineer — does it save actual debugging time?
3. Exceptional UI engineer — does it surface causal insight unavailable from browser DevTools and existing tabs?
4. UI/platform architect — is the abstraction/complexity justified?
5. Product engineer — is there visible differentiated value proportional to implementation cost?

Review both code and actual UI behavior.

## 5. Explicit questions you must answer

Answer these before proposing major new work:

### Product value
- What specific debugging scenarios does Runtime Intelligence solve better than existing Pinpoint + Perf + Network + Errors + Memory?
- Is there at least one scenario where the intelligence layer gives a clearly better answer than the baseline toolkit?
- Is the current root-cause output trustworthy enough to show as "Likely cause"?
- Should uncertain output instead say "Most related signal", "Strongest correlation", or something less assertive?

### Complexity
- How many files/concepts were added for Runtime Intelligence?
- Which are foundational and worth keeping?
- Which can be merged, simplified, hidden, or deleted?
- Is UREP useful as an internal implementation detail even if the Intelligence UI is deferred?
- Is React support currently useful or premature?

### Runtime overhead / memory
- Are stores, arrays, maps, observers, event listeners, global objects, graphs, incident snapshots, and exported capsules bounded?
- Are objects duplicated unnecessarily across EvidenceStore, recorder, graph, capsule, and global presentation?
- Could the debugger itself create memory/performance pressure?
- Are subscriptions disposed correctly?
- Could MutationObservers or panel hooks leak?

### UI/UX
- Does the Intelligence tab explain value without internal terminology?
- Should Runtime Intelligence be a dedicated tab, part of Pinpoint, or perhaps not visible until an incident occurs?
- Is the current dedicated tab actually simpler than baseline?
- Should raw evidence be completely hidden except export/developer mode?

### Root-cause quality
- Review `RootCauseGrouper`, graph semantics, causal vs contextual edges, scoring, attribution, and trigger selection.
- Identify why irrelevant root causes may be reported.
- Never promote temporal correlation to causality.
- Consider whether "root cause" should be renamed until deterministic confidence is possible.

## 6. High-value constraint

Do not build Vue, more frameworks, more collectors, or more architecture until the current Lit/UI Platform value is proven.

The preferred sequence is:

```text
understand current system
    ↓
reproduce real UI Platform scenarios
    ↓
measure usefulness vs baseline
    ↓
simplify / rework / delete
    ↓
only then decide future expansion
```

## 7. Baseline must remain protected

The mature baseline panel and collectors are valuable and should not be broken.

Important baseline areas:

- `lit/src/panel/LdsDebugPanel.js`
- Perf
- Vitals
- Network
- Falcor
- Memory
- Errors
- Events
- Pinpoint
- workflow baseline/replay verification
- resource-lifetime diagnostics
- HTML/debug report export
- UI Platform-specific plugin under `lit/custom/ui-platform/`

The panel is separately exported through package export `./panel` and should remain opt-in.

## 8. Key current Runtime Intelligence files

Review at minimum:

- `lit/src/core/evidence-protocol.js`
- `lit/src/core/evidence-store.js`
- `lit/src/core/evidence-graph.js`
- `lit/src/core/root-cause.js`
- `lit/src/core/incident-flight-recorder.js`
- `lit/src/core/evidence-capsule.js`
- `lit/src/core/enterprise-privacy.js`
- `lit/src/core/runtime-resource-ownership-ledger.js` or equivalent current resource-ledger files
- `lit/src/adapter/FrameworkAdapter.js`
- `lit/src/adapter/lit/LitAdapter.js`
- `lit/src/adapter/react/ReactAdapter.js`
- `lit/src/integration/lit/LitIntelligencePipeline.js`
- `lit/src/integration/lit/developer-intelligence-summary.js`
- `lit/src/integration/lit/panel-intelligence-presentation.js`
- `lit/src/integration/lit/network-evidence-bridge.js`
- `lit/src/integration/lit/legacy-collector-bridge.js`
- `lit/src/LitDebugMixin.js`
- `lit/src/core/memory.js`
- `lit/src/core/event-tracer.js`
- unit tests under `lit/test/unit/`

## 9. Important recent commits

Review these to understand the UX correction path:

- `65b9bd54a2d6b5a680ff3b483083fd63a7011222` — simple Runtime Intelligence usage guide
- `db736ed43127a07f386b1000f2607f01ab834d43` — compact developer-facing intelligence contract
- `f90dfd1259962cd7b9483a4af1ca5a2207ad0750` — attempted keep-visible panel banner fix
- `99662002b5d91050828ecd478f82a7b2c663c6bd` — moved Runtime Intelligence into dedicated panel tab
- `dd9c967fced8c495aafc4b3dfe4bf67037ec8a46` — dedicated Runtime Intelligence documentation
- `b43e9cf22be6eeea5b733336b8b6bb7f704596fb` — regression guard for dedicated-tab contract

Earlier Mission 09.5 implementation commits and architectural history are documented elsewhere in the repo; read the KT files in this same folder.

## 10. Validation expectations

Do not trust static code alone.

Use local executable validation where available:

```bash
cd lit
npm test
npm run test:smoke
npm run build
npm pack
```

Then validate in the actual UI Platform consumer through `npm link` or tarball install.

Important real scenarios:

1. normal page with many RufElement descendants
2. slow Lit render / update
3. runtime render/update error
4. failed network call
5. render storm / repeated update
6. property thrash / circular update where available
7. memory/resource lifetime issue

For each scenario compare:

```text
What could baseline Pinpoint/Perf/Network already tell me?
versus
What extra useful answer did Intelligence provide?
```

If the answer is "little or nothing", simplify or defer the feature.

## 11. Decision freedom

You are explicitly authorized to recommend any of the following:

- keep current Runtime Intelligence architecture mostly intact
- keep internals but significantly simplify UI
- merge Intelligence into Pinpoint
- rename "root cause" to a less assertive concept
- replace current scoring/grouping logic
- remove/defer React support
- reduce the number of files/modules
- keep only reusable internal primitives and disable the product surface
- revert selected Runtime Intelligence UX work
- defer the feature entirely until a concrete debugging scenario proves value

Do not optimize for preserving ChatGPT's work. Optimize for user value and maintainability.

## 12. Future work candidates — do not execute automatically

These were previously considered but are intentionally handed to you for prioritization:

- Interaction/Event tracer → UREP bridge
- Memory/resource lifetime signals → generic resource ledger / UREP
- dynamic enable/disable after page load
- stable public replay-complete event instead of patching private `_completeReplay`
- first-render/TTI semantics bridge from legacy perf
- package contract cleanup (`src` exports vs Rollup `lib` output)
- `npm pack` consumer certification
- React parity improvements
- Vue adapter
- richer causal timeline visualization
- AI/Claude evidence handoff improvements

Do not assume these are needed. Rank by impact/effort only after review.

## 13. Expected output from you

Before major implementation, produce a strategic review containing:

1. What the system is today, in plain language
2. What is genuinely valuable now
3. What is overengineered or premature
4. Root-cause accuracy assessment
5. Runtime overhead/memory safety assessment
6. UX assessment
7. What to keep / rework / remove / defer
8. Top 5 actions ranked by impact vs effort
9. A recommended minimal product definition
10. A concrete validation plan in UI Platform

Then wait for the user to decide the direction, unless the user explicitly instructs you to implement.

## 14. Core success criterion

The feature succeeds only if a developer can say:

> "This found or explained something important faster than the existing panel and browser DevTools, and I understood the answer immediately."

If that cannot be demonstrated, complexity should be reduced rather than expanded.
