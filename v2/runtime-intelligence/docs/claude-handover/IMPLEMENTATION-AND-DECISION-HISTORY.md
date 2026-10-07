# Runtime Intelligence — Implementation and Decision History

This document is a factual KT of what was built, why it was built, what changed during validation, and what remains uncertain. It is meant for Claude to understand the path without needing the prior ChatGPT conversation.

## 1. Starting point

The project started from a mature Lit/RUF debugging toolkit with strong practical value:

- `LitDebugMixin` integration through a shared base element such as `RufElement`
- existing panel at `lit/src/panel/LdsDebugPanel.js`
- visible tabs for Summary, Pinpoint, Vitals, Network, Falcor, Perf, Errors, Console, Events, Slow API, Memory, History, Env
- UI Platform-specific integration under `lit/custom/ui-platform/`
- runtime instrumentation for performance, memory, render storms, errors, property thrash, circular updates, events, network, vitals and workflow baseline/replay
- HTML/JSON export
- local `npm link` development into UI Platform

The baseline experience was simple: enable the tool, open one panel, pick a tab, inspect concrete data.

## 2. Why Runtime Intelligence was introduced

The idea was to go beyond separate diagnostics and answer a higher-level question:

> Can the tool correlate runtime signals and explain what happened, why it likely happened, where to look, and what to do next?

That led to a framework-neutral architecture instead of adding more logic directly into the Lit panel.

## 3. Major architecture introduced

### Framework abstraction

Files/concepts include:

- `FrameworkAdapter`
- `LitAdapter`
- `ReactAdapter`
- capability/support metadata

Goal: make runtime evidence framework-neutral so the same analysis could eventually work across Lit, React, and potentially other frameworks.

### Universal Runtime Evidence Protocol (UREP)

`lit/src/core/evidence-protocol.js`

Introduced normalized immutable runtime events such as:

- owner created/destroyed
- state changed
- dependency triggered
- update requested/started/completed
- resource acquired/released
- network started/completed
- browser frame
- navigation
- error
- diagnostic

It also introduced evidence strength / attribution concepts such as observation, correlation, attribution, lifetime violation, retainer confirmed, causality confirmed.

### EvidenceStore

A bounded runtime store for normalized events.

Purpose:

- preserve a recent evidence window
- allow subscribers such as the incident recorder/pipeline
- avoid unbounded event accumulation

### EvidenceGraph + RootCauseGrouper

Purpose:

- build relationships between events
- group related events into candidate root-cause clusters
- rank candidate root events

This is the area currently most in question because real UI Platform validation produced at least one “Likely cause” that did not look relevant to the user.

### IncidentFlightRecorder

`lit/src/core/incident-flight-recorder.js`

A bounded rolling recorder.

Important defaults/behavior:

- `maxEvents = 300`
- `maxAgeMs = 30_000`
- runtime error is a hard freeze trigger
- slow updates are analyzed from a rolling snapshot and intentionally do not consume/freeze the recorder, so a later crash can still become the stronger incident

### Evidence Capsule

`lit/src/core/evidence-capsule.js`

Portable privacy-filtered forensic export containing:

- problem
- trigger
- owner/source summary
- evidence references
- root-cause summary
- causal chain
- recommendation
- verification
- environment
- AI handoff prompt

During UX review, capsule/event-reference output was found too verbose for normal developers. The design was changed so the capsule is no longer the default public UI/global model.

Recent bounds were added to avoid duplicating huge forensic structures:

- max exported evidence references
- bounded symptoms/candidates
- bounded causal-chain references

### Privacy / enterprise boundary

Evidence export is sanitized and intentionally omits raw runtime payloads from normal exported references.

This is useful infrastructure even if the product-facing Intelligence feature is deferred.

## 4. Lit integration

### LitDebugMixin

The mixin remains the primary application integration point.

Runtime Intelligence is opt-in through:

```js
window.__LDS_INTELLIGENCE_ENABLED__ = true
```

or master config such as:

```js
window.__LDS_DEBUG__ = true
```

The goal was to preserve the existing rule that hundreds of components should not be individually changed.

### LitIntelligencePipeline

`lit/src/integration/lit/LitIntelligencePipeline.js`

Pipeline:

```text
EvidenceStore
  -> IncidentFlightRecorder
  -> EvidenceGraph
  -> RootCauseGrouper
  -> developer summary
  -> optional Evidence Capsule export
```

Current qualifying incident triggers:

1. Lit runtime `ERROR`
2. Lit `UPDATE_COMPLETED` with duration >= 500ms

A failed network request by itself does not create an Intelligence incident. Network data can enrich the evidence context.

### Network bridge

Legacy network collector entries can be translated into privacy-minimal UREP `network.completed` evidence.

Only safe summary fields should cross the bridge; full URLs/query strings/request bodies/raw errors should not be copied as normal evidence payload.

## 5. Verification integration

The existing panel replay workflow was connected to Runtime Intelligence so replay outcomes can update verification state.

Current implementation patches private panel behavior around `_completeReplay`. This was consciously accepted as a transitional bridge and remains technical debt.

Future preferable direction: a public replay-complete event or stable panel API.

## 6. First UX failure: too much technical output

The first developer-facing object exposed too much internal machinery:

- event IDs (`evt-*`)
- evidence arrays
- correlation metadata
- causal-chain references
- root-cause scoring details
- capsule data

The user correctly observed that this looked like internal engineering plumbing rather than a usable product.

Decision taken:

- UREP/evidence graph/capsule are internal machinery
- normal developer UI should only show a compact answer

The compact model became roughly:

```text
status
headline
problem
likelyCause
confidence
source
impact[]
nextAction
verification
technicalEvidence summary only
```

Full evidence moved behind:

```js
window.__LDS_INTELLIGENCE_PIPELINE__.exportCapsule()
```

## 7. Second UX failure: global banner

A Runtime Intelligence card was initially injected above `.tab-content` in the existing panel.

Problems found in the real application:

- it appeared on every tab
- it flashed/disappeared because Lit owns/replaces `.tab-content`
- it complicated the existing panel
- it made a new feature feel intrusive instead of integrated

A MutationObserver/reattachment fix was attempted, but the user correctly challenged the product design itself rather than only the rendering bug.

Decision: remove global banner behavior entirely.

## 8. Current UX: dedicated Intelligence tab

Commit: `99662002b5d91050828ecd478f82a7b2c663c6bd`

Current panel bridge adds a separate `✨ Intelligence` tab next to existing diagnostic tabs without rewriting the large baseline panel file.

The tab explains:

- what Runtime Intelligence is
- what it adds vs original toolkit
- how to use it
- tool state (Intelligence / Perf / Network / Evidence)
- current finding
- optional technical evidence

Finding shape:

```text
Problem
Likely cause
Where
Impact
Do next
Confidence
Verification
```

Regression guard added so Intelligence remains a dedicated tab and does not revert to a global banner.

## 9. Real-world validation feedback

The user validated this in the actual UI Platform application.

Positive observations:

- package linking worked
- Intelligence global/pipeline existed
- evidence was flowing
- dedicated tab became visible
- internal data is now bounded and less exposed

Negative / unresolved observations:

- root-cause candidate shown in at least one real case did not look relevant
- visible value is small relative to architecture/file count
- baseline toolkit feels more immediately useful because each tab exposes clear concrete value
- Intelligence currently feels like a lot of machinery for limited differentiated output
- user cannot yet point to a real scenario where Intelligence clearly saved time or found something baseline tools could not

This feedback should dominate future decisions.

## 10. Important design choices that should not be lost

Even if Intelligence UI is later removed/deferred, several principles remain useful:

### Evidence honesty

Do not say “root cause” when only correlation exists.

Potential language:

- strongest related signal
- likely contributor
- correlated activity
- attributed cause only when attribution is strong
- confirmed cause only after verification/deterministic evidence

### Lower-severity symptoms should not suppress stronger incidents

A slow-update analysis must not prevent a later runtime error from becoming the primary incident.

### Bounded instrumentation

The debugging tool must not become the performance/memory problem itself.

Audit and preserve bounded behavior across:

- stores
- arrays/maps
- recorder windows
- graph construction
- evidence exports
- history
- observers/listeners

### Raw evidence should not be default UI

Internal evidence can be valuable for AI/forensics while remaining hidden from normal developers.

### Existing baseline should remain protected

Do not destabilize the mature panel or collectors just to preserve Runtime Intelligence architecture.

## 11. Known unresolved technical/product issues

1. Root-cause ranking may over-promote temporally related or generic lifecycle events.
2. “Likely cause” wording may be too assertive for current evidence quality.
3. Runtime Intelligence currently reacts only to a narrow incident set (errors and >=500ms Lit updates).
4. Failed network requests alone do not create an Intelligence finding.
5. Legacy memory/resource/event collectors are still largely parallel to UREP rather than fully integrated.
6. There are duplicate concepts/data representations across legacy collectors and generic runtime intelligence.
7. Panel integration still patches panel internals instead of using a stable plugin API.
8. Package exports point to source paths while Rollup emits `lib/`; packaging contract needs certification.
9. Dynamic enablement after app initialization is not fully designed; flags should currently be set before component startup.
10. React abstraction exists but Lit/UI Platform product value is not yet proven, so further framework expansion is premature.

## 12. Validation honesty

ChatGPT work in this environment was mostly source-level via GitHub connector.

Do not assume exact current HEAD has been locally executed unless the user/Claude runs it.

Claude should run:

```bash
cd lit
npm test
npm run test:smoke
npm run build
npm pack
```

Then validate inside UI Platform.

## 13. Current product status

Best description:

> Runtime Intelligence is an experimental interpretation layer over the mature LDS diagnostic toolkit. Its internal evidence/incident architecture is substantial and may become valuable, but current root-cause quality and differentiated day-to-day product value are not yet proven.

The project should now be reviewed for simplification, not automatically expanded.
