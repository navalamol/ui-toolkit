# Future Work and Strategic Decisions — Handed to Claude

This file intentionally separates **possible future work** from **approved work**.

Nothing below is automatically approved. Claude should first validate current value, complexity, runtime cost, and correctness.

---

## 1. Highest-priority review decisions

Before new features, decide the following.

### A. Is Runtime Intelligence worth keeping as a product surface?

Possible outcomes:

1. Keep dedicated Intelligence tab and improve accuracy.
2. Merge useful insights into Pinpoint instead of maintaining a separate tab.
3. Keep internal evidence infrastructure but hide/disable Intelligence UI until it proves value.
4. Remove/defer the Intelligence layer and preserve only reusable foundations.

### B. Is "root cause" terminology too strong?

Current real-world validation produced at least one root-cause result that did not appear relevant to the user.

Possible safer terminology:

- strongest related signal
- likely contributor
- strongest correlation
- suspected trigger
- attributed cause — only when framework/source evidence is deterministic
- confirmed cause — only after verification

Recommended principle:

```text
observation ≠ correlation ≠ attribution ≠ causality
```

UI wording must reflect that ladder.

### C. Does the implementation have too many layers/files?

Review whether some concepts can be consolidated.

Potential simplification candidates:

- presentation summary helpers
- small integration bridges
- duplicated source/correlation helpers
- React proof-of-concept files if unused
- generic policy modules that currently have one consumer

Do not merge merely to reduce file count; reduce concepts where it genuinely improves maintenance.

---

## 2. Previously ranked high-impact / lower-effort work

These were considered before the final user decision to stop development.

They remain backlog candidates only.

### 2.1 Real UI Platform browser validation

Impact: very high
Effort: low-to-medium

Why:

The codebase has strong static structure, but real product value depends on the actual UI Platform runtime.

Validate:

- panel behavior
- tool flags
- lifecycle evidence
- errors
- slow renders
- network correlation
- memory overhead
- false root causes

This remains the most important next activity if work resumes.

### 2.2 Package contract / npm-pack certification

Impact: high
Effort: low

Current ambiguity:

```text
package exports → source files
Rollup → lib files
```

Decide whether source consumption is intentional or whether publishable distribution should consume `lib/`.

Validation should use `npm pack` and a tiny consumer.

### 2.3 Interaction/Event → UREP bridge

Impact: potentially high
Effort: medium

Current gap:

The legacy event tracer knows user/business events but Runtime Intelligence does not fully consume them.

Potential value:

```text
User clicked Save
    ↓
Editor state changed
    ↓
Grid updated repeatedly
    ↓
Falcor calls triggered
    ↓
slow render/error
```

This could make causal explanations much more meaningful than generic lifecycle correlation.

Risk:

- raw event detail may contain sensitive data
- event volume can be high
- correlation semantics must remain honest

If implemented, reuse an observer/subscription seam rather than adding another global interception layer.

### 2.4 Resource lifetime → UREP / generic ownership ledger

Impact: potentially high
Effort: medium

Current state:

- mature legacy memory/resource tracker exists
- newer generic ownership ledger exists
- they are partially parallel

Possible integration:

```text
resource acquired
resource released
owner destroyed
resource still alive
    ↓
lifetime violation
    ↓
clear developer finding
```

This may be a stronger Intelligence use case than generic render root-cause ranking because resource lifetime evidence can be more deterministic.

### 2.5 Dynamic diagnostics enable/disable

Impact: medium
Effort: low

Current limitation:

Page tools are initialized once; setting flags after initial component connection may not fully activate everything.

Possible improvement:

```js
window.__LDS__.enable('perf')
window.__LDS__.enable('intelligence')
window.__LDS__.disable('network')
```

or equivalent explicit lifecycle API.

Only implement if runtime activation is actually needed by users.

### 2.6 Stable replay-complete integration

Impact: medium
Effort: low-to-medium

Current panel bridge may patch private `_completeReplay` to forward verification.

Architecturally cleaner option:

```text
panel dispatches public verification/replay-complete event
intelligence listens to event
```

This removes private prototype coupling.

Do this only after deciding the Intelligence feature remains.

### 2.7 Legacy first-render / TTI semantics bridge

Impact: medium
Effort: low-to-medium

Potentially useful if baseline Perf semantics contain product-specific meaning not represented cleanly in UREP.

Important:

Do not rename render duration as TTI unless semantics truly match.

### 2.8 Additional framework adapters

Examples:

- Vue
- stronger React parity

Current recommendation: defer.

Why:

Framework neutrality has already been partially proven through Lit + React abstractions. More frameworks do not solve current product-value concerns.

### 2.9 Major panel redesign

Current recommendation: avoid.

The baseline panel is mature and useful.

Focus should be on meaningful insight, not cosmetic reinvention.

---

## 3. Potentially stronger future Intelligence use cases

If Claude decides the intelligence concept is worth pursuing, prioritize scenarios where causal evidence is naturally stronger.

### A. Resource lifetime violation

Example:

```text
Problem
ProductEditor was removed, but 3 window listeners and 1 timer remain active.

Cause
Resources were registered by ProductEditor lifecycle generation #4 and were never released.

Where
product-editor.js:212

Impact
Potential leak across repeated navigation.

Do next
Remove listeners/timers in disconnectedCallback().

Confidence
Strong — lifetime violation observed after owner destruction.
```

This is more defensible than speculative generic root-cause scoring.

### B. Repeated property/update cascade

Example:

```text
User action
Change category

Observed chain
category changed
→ ProductEditor requested 11 updates
→ ProductGrid rendered 9 times
→ 6 Falcor requests

Finding
The category change is causing repeated downstream refresh instead of one coalesced refresh.
```

This could be valuable if event + property + update correlation is deterministic.

### C. Verified regression/fix comparison

Example:

```text
Before
12 renders · 6 requests · 780 ms

After
2 renders · 1 request · 210 ms

Result
Fix verified
```

This is concrete and easier to trust.

### D. Network request amplification

Example:

```text
One UI action triggered the same logical Falcor path 14 times in 900 ms.
```

Baseline Falcor/network collectors may already expose much of this; Intelligence should add only if it provides clear cross-signal explanation.

---

## 4. Runtime safety / performance audit backlog

Claude should explicitly inspect the tool as if it were production instrumentation.

### Evidence retention

Check:

- `EvidenceStore` max entries
- evicted reference bounds
- recorder max events
- recorder max age
- capsule limits
- graph object lifetime

### Duplicated snapshots

Potential duplication path:

```text
EvidenceStore events
    ↓
Recorder events
    ↓
EvidenceGraph nodes
    ↓
Incident snapshot
    ↓
Capsule references
    ↓
Public intelligence model
```

Some references are immutable/shared while others are cloned. Quantify realistic overhead.

### Global objects

Audit all `window.__LDS_*` references.

Ask:

- are they bounded?
- are they necessary?
- do they prevent GC?
- can old session data accumulate?

### Subscribers/listeners

Audit:

- store subscribers
- network bridge listeners
- event listeners
- MutationObservers
- panel hooks
- lifecycle cleanup

### Instrumentation overhead

Measure:

- idle overhead
- per Lit update overhead
- large component tree overhead
- network-heavy workflow overhead
- memory footprint after long sessions

Success rule:

> The debugger must never become the dominant reason the app is slow or retains memory.

---

## 5. UI / usability backlog

Only pursue after deciding to keep the Intelligence surface.

### Desired developer flow

The ideal usage should be:

```text
1. Enable LDS
2. Reproduce problem
3. Open panel
4. Read one clear finding
5. Drill into source tabs only if needed
```

No developer should need to inspect:

```text
evt-123
cluster-4
trace IDs
raw UREP
root-cause score formulas
reference arrays
```

unless explicitly debugging the debugger.

### Dedicated tab vs Pinpoint

This remains an open product decision.

Arguments for dedicated Intelligence tab:

- conceptually clear separation
- room for explanation/current finding
- does not disturb mature Pinpoint

Arguments for merging into Pinpoint:

- fewer tabs
- Pinpoint already represents diagnosis
- avoids creating another surface with overlapping purpose

Claude should evaluate with real users/scenarios.

---

## 6. Strategic architecture questions

### Is UREP valuable independently?

Potential yes:

- normalized event contract
- privacy boundary
- adapters
- testability
- AI handoff
- future cross-framework runtime tooling

Potential no / overkill:

- if only Lit uses it
- if baseline collectors already provide enough semantics
- if no meaningful cross-signal product behavior emerges

Possible compromise:

Keep UREP internal and stop exposing it as a major product concept.

### Is ReactAdapter worth keeping?

It provides architectural proof but has low immediate UI Platform value.

Options:

- keep because maintenance cost is tiny
- move to experimental
- remove until there is a consumer

### Should generic resource ledger remain?

Potentially yes, because resource lifetime evidence may become one of the strongest differentiators.

But parallel tracking with legacy memory collector should be resolved eventually.

---

## 7. Suggested decision matrix

For every subsystem, classify it:

| Subsystem | Keep | Rework | Merge | Defer | Remove | Reason |
|---|---:|---:|---:|---:|---:|---|
| EvidenceStore |  |  |  |  |  |  |
| UREP schema |  |  |  |  |  |  |
| EvidenceGraph |  |  |  |  |  |  |
| RootCauseGrouper |  |  |  |  |  |  |
| Incident recorder |  |  |  |  |  |  |
| Evidence Capsule |  |  |  |  |  |  |
| LitAdapter |  |  |  |  |  |  |
| ReactAdapter |  |  |  |  |  |  |
| Network bridge |  |  |  |  |  |  |
| Intelligence pipeline |  |  |  |  |  |  |
| Intelligence tab |  |  |  |  |  |  |
| Resource ledger |  |  |  |  |  |  |

Use actual evidence, not preservation bias.

---

## 8. Recommended first three tasks if work resumes

### Task 1 — independent architecture/product audit

No implementation.

Output:

- value assessment
- complexity assessment
- root-cause correctness assessment
- runtime overhead assessment
- keep/rework/remove table

### Task 2 — three real UI Platform case studies

Choose real problems.

For each record:

```text
Scenario
Baseline answer
Intelligence answer
Was Intelligence more useful?
Was it correct?
Time saved
False/confusing claims
```

### Task 3 — minimum viable rework

Only after Tasks 1–2.

Aim for the smallest implementation that produces clearly differentiated value.

---

## 9. What should NOT happen next

Do not immediately:

- add Vue
- add more generic protocols
- create more scoring layers
- create more global objects
- redesign the whole panel
- add many new collectors
- claim causality from timing alone
- expose raw evidence to normal users
- continue missions just because they were previously planned

---

## 10. Final strategic principle

This project should optimize for:

```text
useful diagnosis per line of instrumentation
```

not:

```text
architectural sophistication per number of modules
```

The mature baseline is already strong. Any new Runtime Intelligence layer must earn its complexity through clearly demonstrated debugging value.
