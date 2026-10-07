# Runtime Intelligence — Future Work and Strategic Review Queue

This document captures previously discussed next work, but **nothing here is automatically approved**. Claude should use it as a backlog of hypotheses and decide what is worth doing only after reviewing current product value.

## 1. Immediate rule

Do not continue broadening the system until Lit/UI Platform value is proven.

The preferred sequence is:

```text
review current implementation
  -> reproduce real UI Platform problems
  -> compare against baseline toolkit
  -> simplify / rename / remove weak parts
  -> prove one or two strong scenarios
  -> only then expand
```

## 2. Highest-priority strategic questions

Claude should answer these before building more:

### A. Is Runtime Intelligence actually useful today?

For each real bug scenario, compare:

```text
Baseline Pinpoint / Perf / Network / Errors / Memory
vs
Runtime Intelligence
```

Ask:

- Did Intelligence save debugging time?
- Did it identify a relationship the developer would otherwise miss?
- Was the answer trustworthy?
- Was the answer understandable immediately?
- Did it provide a clear next action?

If not, reduce or defer it.

### B. Is “root cause” the wrong product promise?

Current real-world feedback suggests at least one candidate looked irrelevant.

Possible alternatives:

- Strongest related signal
- Likely contributor
- Correlated activity
- Suspected cause
- Attributed cause
- Confirmed cause only after verification

Consider an explicit evidence ladder in product language rather than internal terminology.

### C. Is the architecture too large for the value delivered?

Inventory the number of Runtime Intelligence-specific files and concepts.

For each, classify:

```text
KEEP      foundational / reusable / low-cost
MERGE     useful but unnecessarily fragmented
REWORK    idea is useful, implementation/value weak
DEFER     premature
REMOVE    complexity without demonstrated benefit
```

The user explicitly values a small, visible, understandable tool.

## 3. Previously planned future work

These items were discussed before the stop decision. Claude should rank them by impact vs effort and may reject them.

### 3.1 Interaction / Event tracer -> UREP bridge

Current legacy event tracer already captures runtime interaction/event timelines.

Potential value:

```text
user action
  -> state change
  -> component updates
  -> API calls
  -> error / slow render
```

This could materially improve causal interpretation because current evidence often lacks a strong initiating interaction.

Risks:

- more events/noise
- privacy concerns if event detail is copied
- memory overhead
- false causality from temporal proximity

If pursued, keep only minimal action name/source/correlation metadata. Do not copy arbitrary event payload/detail.

### 3.2 Memory/resource lifetime -> UREP / generic ownership ledger

Legacy memory tooling already tracks mounts/unmounts and resource violations.

Potential generic flow:

```text
RESOURCE_ACQUIRED
  -> owner destroyed
  -> resource not released
  -> lifetime violation
  -> strong diagnostic finding
```

This is potentially more valuable than generic temporal root-cause scoring because lifetime violations can be deterministic.

Possible high-value scenario:

- event listener/timer/subscription survives component destruction
- tool identifies owner + resource + acquisition site
- developer gets a concrete fix target

This may be one of the strongest future Intelligence use cases because the evidence can be much more trustworthy.

### 3.3 Dynamic enable/disable after page load

Current instrumentation generally expects flags to be enabled before component initialization.

Potential improvement:

```js
LDS.enable('perf')
LDS.enable('intelligence')
LDS.disable('network')
```

Benefits:

- easier developer workflow
- avoid full reload
- lower default overhead

Risks:

- patch/unpatch complexity
- duplicate subscriptions
- lifecycle edge cases

Only pursue if actual developer usage justifies it.

### 3.4 Replace private `_completeReplay` patch with public event/API

Current Runtime Intelligence verification bridge patches private panel internals.

Preferred future shape:

```text
panel dispatches lds-replay-completed
  -> intelligence subscribes
  -> verification recorded
```

This is a maintainability improvement, not immediate user value. Do it only when touching replay architecture or stabilizing plugin APIs.

### 3.5 Legacy performance / first-render semantics bridge

The baseline Perf tool may contain mature concepts such as render counts/TTI-style timing that are more useful than generic update events.

Potential work:

- map only high-value legacy perf signals into normalized evidence
- preserve original measurements
- avoid duplicating all perf history

Goal: improve context for Intelligence without replacing a working Perf tab.

### 3.6 Package / publish contract cleanup

Current package builds Rollup output under `lib/`, while package exports still reference source paths in places.

Required certification eventually:

```bash
npm test
npm run build
npm pack
```

Then install the generated tarball into a tiny consumer or UI Platform.

Questions:

- should published exports point to `lib/`?
- how to preserve existing `npm link` workflow?
- how to keep panel separate and opt-in?
- how to keep UI Platform custom bundle available?

This is practical release hygiene and likely worth doing independently of Intelligence.

### 3.7 React parity

A React adapter exists as architecture proof.

Do not invest further until:

- Lit value is proven
- generic protocol proves necessary
- at least one concrete React consumer exists

Otherwise React work is architecture-driven rather than product-driven.

### 3.8 Vue or additional framework adapters

Explicitly defer.

There is currently no justification for another framework.

### 3.9 Rich causal timeline visualization

Potential UI:

```text
Click Save
  -> editor.value changed
  -> grid updated 14x
  -> 6 API requests
  -> render 716ms
```

This could be visually compelling if the causal data is trustworthy.

Do not build it until causal accuracy is proven. A beautiful visualization of weak inference makes the product worse.

### 3.10 AI / Claude evidence handoff

Evidence Capsule was designed partly for AI handoff.

Potentially useful workflow:

```text
Runtime issue
  -> privacy-safe capsule
  -> Claude/Copilot prompt
  -> investigation assistance
```

This may become useful even if the Intelligence tab itself is reduced.

Review whether the capsule is:

- compact enough
- privacy safe
- useful to an AI
- free of redundant event references
- grounded in evidence honesty

## 4. Potential better product directions

Claude has permission to choose one of these instead of continuing the current direction.

### Direction A — Keep Intelligence, fix accuracy

Keep architecture but change UX/scoring until one or two scenarios are clearly valuable.

Best fit if root-cause quality can be materially improved without major complexity.

### Direction B — Keep internals, hide Intelligence UI

Use UREP/EvidenceStore/Capsule as infrastructure for future features/AI export, while removing or disabling the Intelligence tab until strong scenarios exist.

Best fit if internals are technically useful but product promise is premature.

### Direction C — Merge Intelligence into Pinpoint

Instead of a separate interpretation product, enhance each Pinpoint issue with:

```text
Why this matters
Strongest supporting evidence
Likely contributor
Suggested next check
```

Best fit if users already understand/trust Pinpoint.

### Direction D — Narrow Intelligence to deterministic scenarios

Stop trying to infer generic root causes.

Focus on situations with strong evidence:

- resource outlived owner
- circular updates
- repeated property thrash with source attribution
- crash attributed to update chain
- duplicate/avoidable network request patterns
- verified regression against workflow baseline

This may create much more credible value with less “AI-like guessing.”

### Direction E — Revert most Intelligence product work

Keep baseline toolkit and only retain generic infrastructure that has independent value.

This is acceptable if complexity/value review does not justify the feature.

## 5. Suggested review experiments

Use real UI Platform scenarios, not synthetic tests only.

### Experiment 1 — Slow render

Capture a real component with >500ms update.

Compare:

- Perf tab
- Pinpoint
- Intelligence

Ask: did Intelligence identify a useful upstream cause, or merely repeat “slow render”?

### Experiment 2 — Runtime error

Trigger a known render/update error.

Check whether Intelligence identifies the correct preceding state/update and source.

### Experiment 3 — Network failure

Toggle offline or force API failure.

Baseline Network already shows failure. Decide whether Intelligence should add anything and whether network-only incidents are valuable.

### Experiment 4 — Resource leak / outlived owner

Use a component with listener/timer/subscription cleanup bug.

This should be prioritized because deterministic ownership evidence may be far more meaningful than generic root-cause scoring.

### Experiment 5 — Render storm / property thrash

Create or locate a real repeated-update scenario.

Check whether Intelligence can explain the initiating property/interaction better than Pinpoint.

## 6. Runtime overhead review checklist

Audit all of these:

- `EvidenceStore` retention bounds
- recorder max events/max age
- graph lifetime and temporary allocations
- capsule duplication
- root-cause candidate arrays
- global objects
- `__LDS_HISTORY__`
- legacy network logs
- memory maps
- event timeline arrays
- observers/listeners introduced by panel bridges
- adapter subscriptions
- source stack capture frequency

The debugger must fail safe and bounded.

Where possible add measurable budgets, e.g.:

```text
max evidence events
max network entries
max event timeline entries
max capsule refs
max history snapshots
max retained stack traces
```

## 7. Product success gate

Before approving future expansion, demonstrate at least one scenario where a developer says:

> “The baseline showed symptoms, but Intelligence connected them and gave me the right place to investigate faster.”

Prefer two scenarios with different failure types.

If that cannot be demonstrated, stop or narrow the product.

## 8. Recommended output from Claude before coding

Claude should produce:

1. Current architecture map
2. File/concept complexity inventory
3. Root-cause accuracy review
4. Runtime overhead/memory review
5. Baseline vs Intelligence feature comparison
6. Keep / merge / rework / defer / remove matrix
7. Top 5 next actions with impact/effort
8. Recommended minimal product definition
9. Exact real-app validation scenarios
10. Explicit recommendation: continue, narrow, merge into Pinpoint, hide, or revert

Then the user should choose the direction.
