# ChatGPT Work KT and Decision History

This document is a technical and product handover of the Runtime Intelligence work added on top of the Lit Debug Suite baseline.

It is intentionally candid. It documents what was built, why it was built, what changed during user validation, and what remains uncertain.

---

## 1. Starting point

The project began from a mature Lit/RUF debugging toolkit used in UI Platform.

The baseline toolkit already had substantial value:

- floating debug panel
- Summary
- Pinpoint
- Vitals
- Network
- Falcor
- Perf
- Errors
- Console
- Events
- Slow API
- Memory
- History
- Env
- HTML/debug report generation
- workflow baseline/replay
- resource lifetime diagnostics
- UI Platform-specific integrations such as Falcor decoding and DataObjectManager instrumentation

The original product characteristic was simplicity of integration:

```text
UI Platform components
      ↓
RufElement / shared Lit base
      ↓
LitDebugMixin
      ↓
collectors
      ↓
LDS debug panel
```

The user repeatedly emphasized that the tool should provide immediately visible, practical value rather than architecture that requires explanation.

---

## 2. Why Runtime Intelligence was introduced

The perceived limitation of the baseline was that most tabs exposed signals independently.

Example:

```text
Perf says component X is slow
Network says request Y failed
Events says action Z happened
Errors says render crashed
Memory says something remained mounted
```

A developer still had to mentally correlate these signals.

The Runtime Intelligence idea attempted to add a framework-neutral layer that could answer:

```text
What happened?
What likely caused it?
Where should I look?
How strong is the evidence?
What should I do next?
```

This led to a new internal architecture.

---

## 3. Major architecture added

### 3.1 Framework adapters

A generic adapter model was introduced so framework instrumentation could emit a normalized event stream.

Important concepts:

- `FrameworkAdapter`
- `LitAdapter`
- `ReactAdapter`

The goal was to prove that the diagnostic intelligence model was not permanently tied to Lit.

This was strategically interesting, but its immediate product value is unproven because Lit/UI Platform remains the real consumer.

### 3.2 Universal Runtime Evidence Protocol (UREP)

A normalized evidence schema was introduced.

Representative event types include:

- `owner.created`
- `owner.destroyed`
- `interaction`
- `state.changed`
- `dependency.triggered`
- `component.update.requested`
- `component.update.started`
- `component.update.completed`
- `resource.acquired`
- `resource.released`
- `network.started`
- `network.completed`
- `browser.frame`
- `navigation`
- `error`
- `diagnostic`

Each event can carry:

- owner identity
- correlation references
- evidence level
- attribution quality
- bounded runtime summaries
- source information
- privacy audit information

This provides a strong internal protocol but originally leaked too much terminology into user-visible objects.

### 3.3 EvidenceStore

`EvidenceStore` is a bounded framework-neutral store.

Important behavior:

- default maximum event count is bounded
- old events are evicted
- evicted IDs are tracked with bounded tombstones
- duplicate IDs are rejected
- privacy policy is enforced before immutable evidence creation
- subscribers are isolated so diagnostic failures do not break the app

Global helpers include:

```js
window.__LDS_EVIDENCE_STORE__
window.__LDS_EVIDENCE__()
```

### 3.4 IncidentFlightRecorder

A bounded rolling recorder was introduced.

Representative defaults:

- max events around 300
- max age around 30 seconds

Important behavior:

- rolling incident context
- hard freeze on runtime errors
- slow updates are analyzed transiently instead of consuming the recorder
- recorder can resume and clear

A critical design correction occurred here:

> lower-severity slow-update analysis must never prevent a later high-severity runtime error from being captured.

### 3.5 EvidenceGraph

A graph representation was added to correlate evidence events.

The graph is intended to distinguish relationships such as:

- structural/contextual relationships
- temporal relationships
- explicit causal references

A prior Claude review found an important correctness issue where contextual reachability could overstate causal confidence. That was corrected before Mission 09.5 closure work.

Nevertheless, the current user's latest real-world observation suggests root-cause ranking still may not be practically trustworthy enough.

### 3.6 RootCauseGrouper

A root-cause grouping/scoring layer ranks related events/clusters.

Its output includes concepts such as:

- root event
- root label
- strength
- score
- symptoms
- candidates

This layer is the most important current review target because a real UI Platform test produced a root cause that the user considered likely irrelevant.

The architecture must not confuse:

```text
temporal proximity
with
actual causality
```

### 3.7 Source resolution

Source-resolution work attempts to identify useful file/line information and preserve evidence honesty.

The desired UX is:

```text
Where
src/components/product-editor/product-editor.js:418
```

instead of requiring a developer to inspect raw event metadata.

### 3.8 Evidence Capsule

A privacy-filtered portable artifact was introduced for deep debugging or AI handoff.

The capsule includes:

- problem
- trigger
- owner
- source
- bounded evidence references
- root cause summary
- bounded causal chain
- recommendation
- verification
- environment
- AI prompt

Important later correction:

The capsule originally duplicated too much forensic information.

It was changed to bound evidence references and candidate/symptom arrays. The normal UI no longer exposes the capsule directly.

Current intended access:

```js
window.__LDS_INTELLIGENCE_PIPELINE__.exportCapsule()
```

This is supposed to be optional advanced/AI handoff data only.

### 3.9 Privacy boundaries

Enterprise-safe privacy handling was added so raw payloads, query details, sensitive strings, and runtime values do not automatically cross the evidence/export boundary.

Examples include:

- sanitized source paths
- bounded runtime summaries
- shape-only capture capability
- export-time sanitization
- network bridge intentionally excludes full request bodies and raw sensitive payloads

### 3.10 Resource ownership model

A newer generic runtime resource ownership ledger exists in addition to the legacy memory/resource tracker.

This is strategically useful but currently creates a potential parallel-model problem.

Legacy `memory.js` still maintains its own resource ledger and violations.

Future integration was planned but not completed.

---

## 4. Lit integration

### 4.1 LitDebugMixin

`LitDebugMixin` remains the shared integration point.

Page-level tools are initialized once.

Important enablement logic currently includes:

```text
intelligence flag → start intelligence pipeline
network flag → start network collector
intelligence + network → install network evidence bridge
```

One known limitation:

If tools are disabled when the first component initializes, `_pageToolsInited` can prevent later console flag changes from reinitializing everything.

Therefore current guidance is to enable flags before application/component startup.

Dynamic activation was listed as possible future work.

### 4.2 LitAdapter lifecycle evidence

The adapter emits normalized lifecycle/update evidence.

It can represent:

```text
component created
update requested
update started
update completed
error
```

The integration was designed so the first owner lifecycle event is captured when flags are enabled early.

### 4.3 Legacy collector bridge

Legacy Lit error collection is bridged into UREP so the new intelligence layer can consume real baseline signals instead of reimplementing the entire collector stack.

This bridging approach was intentional:

> reuse mature collectors; do not build duplicate instrumentation unless necessary.

### 4.4 Network evidence bridge

Legacy network completion entries are bridged into `network.completed` UREP events.

The bridge intentionally exposes safe fields only, such as:

- method
- path without query
- status
- duration
- approximate response size
- transport/flags

A failed network request currently does **not** automatically trigger an intelligence incident.

That was intentional to prevent every transient 404/offline request from becoming a root-cause finding.

Network evidence enriches context around actual incidents.

---

## 5. Intelligence pipeline behavior

Current Lit intelligence triggers are intentionally narrow:

### Runtime error

A UREP `error` event hard-freezes the recorder and produces an analysis.

### Slow Lit update

A `component.update.completed` event with duration above the configured threshold (default around 500 ms) produces a transient analysis.

It does **not** freeze the recorder so that a later runtime error remains capturable.

This was a deliberate correctness invariant.

### Not currently first-class incident triggers

Examples:

- generic failed network request
- normal property changes
- ordinary events
- generic memory changes

These may participate as evidence but are not necessarily incident triggers.

---

## 6. Initial public UX problem

The first version of the intelligence output exposed a very large object through:

```js
window.__LDS_INTELLIGENCE__
```

The object contained too much internal machinery, including:

- incident metadata
- causal chain references
- evidence IDs
- root cause internals
- capsule-like data
- many `evt-*` references

The user described this as hard to understand and visually poor.

The key product realization was:

> UREP is internal machinery. It is not the developer product.

This led to creation of a developer interpretation layer.

---

## 7. Developer interpretation layer

`developer-intelligence-summary.js` was introduced.

The public model was simplified to fields such as:

```text
status
headline
explanation
problem
likelyCause
confidence
source
impact[]
nextAction
technicalEvidence summary
verification
```

The intent was to translate internal diagnostics into plain developer language.

The full forensic capsule was moved behind an explicit export method.

The ready state also became explicit:

```text
Runtime Intelligence is ready
```

instead of leaving `window.__LDS_INTELLIGENCE__` undefined before the first incident.

---

## 8. Panel presentation evolution

This area went through several corrections because real UI Platform validation exposed UX problems.

### Version 1 — injected banner

A small Runtime Intelligence banner was injected into the existing panel DOM.

Problem:

- it appeared at the top of unrelated tabs
- the user considered this conceptually wrong
- Lit panel rerenders could replace the injected DOM
- banner could flash/disappear

### Version 2 — resilience patch

The bridge attempted to reattach the banner and expose tool status.

Problem:

- still conceptually wrong because intelligence should not sit globally above every tab

### Version 3 — dedicated Intelligence tab

The current implementation adds:

```text
✨ Intelligence
```

as a dedicated tab near Pinpoint/Vitals/Network.

The dedicated tab explains:

- what Runtime Intelligence is
- how it differs from baseline
- how to use it
- tool status
- current finding
- optional technical evidence

No global banner should be injected into other tabs.

This was a direct response to user feedback.

---

## 9. Current product concern

Despite the UX improvements, the user tested a real finding and reported:

> the root cause mentioned does not look relevant

This is the most important current issue.

The user therefore does not yet perceive immediate compelling value.

They specifically compare the new system to the earlier toolkit where:

```text
one flag
one integration
one tab
clear unique value
```

The current Runtime Intelligence implementation introduced many files and abstractions while visible incremental value remains modest.

This is why work is being stopped and transferred for independent review.

---

## 10. Memory/performance safety work already done

The user explicitly raised concern that the debugger itself must not create memory/performance problems.

Existing protections include:

### EvidenceStore

- bounded entries
- bounded evicted-reference map

### IncidentFlightRecorder

- bounded event count
- bounded time window

### Evidence Capsule

- bounded evidence references
- bounded root symptoms
- bounded root candidates
- bounded causal chain

### Public intelligence model

- compact model only
- no giant incident arrays
- no raw `evt-*` reference arrays

Still review carefully for:

- duplicated immutable snapshots
- observers
- subscriptions
- closure retention
- global references
- panel bridge hooks
- resource ledger duplication
- memory collector patching

---

## 11. Important tests and contracts

Tests exist for areas including:

- ready state
- compact intelligence model
- runtime error analysis
- slow update analysis
- later runtime error priority
- evidence privacy
- bounded capsule references
- baseline package compatibility
- panel export contract
- custom UI Platform integration preservation
- dedicated Intelligence tab contract

The ChatGPT environment did not execute local tests/builds. Static review and repository mutation were possible, but executable validation must be done locally.

Do not assume green tests without running them.

---

## 12. Package/build architecture concern

Current package exports historically point to source files such as:

```text
./src/index.js
./src/panel/LdsDebugPanel.js
./custom/ui-platform/index.js
```

Rollup emits a `lib/` build.

This creates a source-vs-build contract ambiguity.

Local `npm link` can work because source is directly consumed, but distribution strategy is conceptually unclear.

Do not switch exports blindly because compatibility tests currently protect source-path exports.

Recommended validation:

```bash
npm pack
```

then install the tarball into a tiny consumer and verify:

```js
import ... from 'lit-debug-suite'
import 'lit-debug-suite/panel'
import 'lit-debug-suite/custom/ui-platform'
```

---

## 13. Known parallel-model gaps

### Event tracer

Legacy `event-tracer.js` currently records timelines/frequency information but does not feed UREP.

A future bridge was considered:

```text
user interaction
    ↓
state/update
    ↓
network
    ↓
slow/error
```

This was not implemented and should not be assumed necessary.

### Memory/resource tracker

Legacy memory/resource tracking and the newer generic ownership ledger remain partly separate.

A future bridge was considered:

```text
legacy resource acquire/release
    ↓
UREP resource events
    ↓
generic ownership ledger
    ↓
lifetime violation
    ↓
intelligence
```

Again, do not implement automatically.

---

## 14. Product lessons from this work

### Lesson 1 — internal architecture can be useful without being user-visible

UREP/evidence graphs may still be valuable as an internal foundation, but the UI should never expose them by default.

### Lesson 2 — evidence honesty matters more than sounding intelligent

If the system only has correlation, say correlation.

Do not call something a root cause unless evidence justifies it.

### Lesson 3 — baseline value must be the benchmark

Any Intelligence feature must prove it is better than manually reading Pinpoint + Perf + Network + Errors.

### Lesson 4 — integration simplicity is part of the product

The original toolkit's simplicity was a strength.

Any new architecture must preserve:

```text
one shared base integration
minimal flags
minimal app changes
minimal runtime overhead
```

### Lesson 5 — user-visible value should scale with code complexity

If twenty new modules produce only a small extra tab with questionable output, the ratio is wrong.

---

## 15. Current recommendation at handover

Do not immediately continue building.

Perform the following review:

```text
1. Run all tests/builds
2. Validate in real UI Platform
3. Reproduce 2–3 concrete incidents
4. Compare baseline vs Intelligence value
5. Audit root-cause scoring
6. Audit runtime overhead/memory
7. Decide keep/rework/remove/defer
```

The current system should be treated as a substantial prototype/foundation, not a proven finished product.

---

## 16. Current definition of success

Runtime Intelligence is successful only if it can repeatedly produce a result like:

```text
Problem
ProductGrid render took 730 ms

Strongest explanation
Editor.value changed 14 times and triggered 12 ProductGrid updates

Where
product-editor.js:418

Impact
12 renders · 5 requests · 730 ms

Do next
Debounce or coalesce the value-triggered grid refresh.

Confidence
High — framework-attributed
```

and that answer is materially faster/more useful than inspecting baseline tabs manually.

Until then, keep claims conservative.
