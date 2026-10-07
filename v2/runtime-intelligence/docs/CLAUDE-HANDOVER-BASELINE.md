# Claude Handover — Baseline → Runtime Intelligence

Use this file as the **entrypoint** when continuing work in `Amonaval/runtime-intelligence`.

The goal is to understand the product quickly without reading every historical `.md` file.

---

## 1. Product in one sentence

Runtime Intelligence is evolving the original advanced **Lit/RUF debugging toolkit** into a framework-neutral runtime intelligence platform **without reducing the original Lit/Main Platform product**.

The original Lit implementation is the gold-standard product experience. The generic architecture must become an **additive superset**, not a replacement that strips away mature capabilities.

---

## 2. Canonical original baseline

The exact advanced baseline is:

```text
Repository: navalamol/ui-toolkit
Commit:     524d3c9a9e3864cd1f52f59d739ea10b8cdfd10a
Message:    Falcor Master Toolkit lit-debug-suite Falcor Tab
```

It is also represented by the original uploaded archive `ui-toolkit-main (1).zip`.

When a baseline-owned file is modified, preserve its original:

- indentation;
- comments;
- ordering;
- structure;
- product behavior.

Make the smallest semantic diff possible.

Do **not** broadly reformat, compress, minify, rewrite, rename, or delete baseline files during feature missions.

---

## 3. Non-negotiable product invariant

**Generic Runtime Intelligence is additive.**

Do not remove or hide existing product surfaces merely because they are Lit-specific or Main Platform-specific.

These are first-class product assets and must remain intact unless an explicit migration mission replaces them with proven parity:

```text
lit/src/panel/LdsDebugPanel.js
lit/custom/ui-platform/**
lit/docs/features/**
lit/src/core/** mature collectors
panel / report / Pinpoint / Fix Table workflows
Falcor / ACI / Syndigo semantic tooling
extension/build surface where applicable
```

Main Platform is the primary real-world use case. Generic framework support is for broader reuse, but must not degrade Main Platform capability.

---

## 4. Minimal reading order

Do **not** read every mission document first.

Read only these, in this order:

### Required — always

1. `docs/ENGINEERING-RULES.md`
   - mission efficiency;
   - evidence honesty;
   - commit discipline;
   - Main Platform compatibility;
   - baseline formatting rules.

2. `lit/docs/BASELINE-SOURCE.md`
   - exact original product reference;
   - gold-standard capabilities and important baseline paths.

3. `lit/docs/PRE-MISSION-10-AUDIT.md`
   - what was reviewed;
   - defects found/fixed;
   - what is genuinely complete;
   - what remains only partially integrated.

### Then read only what the current task requires

If changing adapters/protocol:

4. `lit/docs/architecture/FRAMEWORK-ADAPTER-V2.md`
5. `lit/docs/architecture/UNIVERSAL-EVIDENCE-PROTOCOL.md`

If continuing after Mission 09:

6. `lit/docs/MISSION-09-REACT-PRODUCTION-ADAPTER.md`

If changing a mature Lit feature:

7. Read the matching file under `lit/docs/features/` only.

Examples:

```text
Perf            → docs/features/01-perf-monitor.md
Prop Audit      → docs/features/02-prop-audit.md
Inspector       → docs/features/03-inspector.md
Events          → docs/features/04-event-tracer.md
Slow API        → docs/features/05-slow-api.md
Vitals          → docs/features/07-vitals.md
Network         → docs/features/08-network.md
Cycles          → docs/features/09-cycle-detector.md
Resources       → docs/features/10-resource-tracker.md
Workflow        → docs/features/11-workflow-baseline.md
Memory          → docs/features/12-memory-counters.md
Falcor          → docs/features/15-falcor-tab.md
```

If modifying panel/Main Platform behavior, compare against the canonical baseline commit before accepting a regression.

### Historical docs — only when needed

Read `MISSION-01...MISSION-08` docs only when touching the specific subsystem created by that mission.

Do not spend time reading every historical handover before coding.

---

## 5. Architecture built so far

Current intended pipeline:

```text
Framework Adapter
      ↓
Universal Runtime Evidence Protocol (UREP)
      ↓
EvidenceStore + Enterprise Privacy
      ↓
Evidence Graph
      ↓
Root Cause grouping
      ↓
Source Resolver
      ↓
Incident Flight Recorder
      ↓
Workflow Baseline / Compare / Verify
      ↓
Evidence Capsule
      ↓
Resource Ownership Ledger
      ↓
Rules / Budgets / Suppressions
```

Framework-neutral intelligence belongs below the framework/product layer.

The Lit product may still keep richer framework-specific tooling above it.

---

## 6. Mission state

### Mission 01 / 01.1

FrameworkAdapter v2 + UREP foundation and hardening.

Important concepts:

- immutable evidence snapshots;
- lifecycle generations;
- correlation IDs;
- duplicate ID rejection;
- privacy-aware capture;
- capability-aware adapters.

### Mission 02

Evidence Graph + Root Cause grouping.

Rules:

- `causedByEventId` = causal edge only when explicitly supported;
- `parentEventId` = structural lineage only;
- shared trace/interaction = correlation only;
- never invent causal adjacency.

### Mission 03

Generic Source Resolver.

Resolution hierarchy:

```text
direct
→ framework
→ source-map
→ registry
→ generated fallback
→ unresolved
```

Source resolution does not upgrade evidence level.

### Mission 04

Incident Flight Recorder.

Bounded rolling evidence window with freeze/resume semantics.

### Mission 05

Baseline + Compare + Verify + Evidence Capsule.

Only verification may claim a fix is causality-confirmed.

### Mission 06

Resource Ownership Ledger v2.

Important audit fix:

```text
resource identity = framework + owner + lifecycle generation + resourceId
```

Do not allow same `resourceId` across different owners to collide.

### Mission 07

Enterprise Privacy / Redaction.

Privacy applies at capture and export boundaries.

Privacy must not change evidence semantics.

### Mission 08

Rules / Budgets / Suppressions.

Core law:

> Rules classify evidence; they do not manufacture stronger evidence.

### Mission 09

React Production Adapter.

Key architectural proof:

- no React/Fiber private internals;
- no React runtime dependency in generic core;
- public Profiler timing only;
- explicit app instrumentation where required;
- `UPDATE_CAUSE` remains unsupported unless genuinely provable;
- framework differences are represented honestly rather than forced into Lit semantics.

---

## 7. Evidence model — do not weaken this

Evidence ladder:

```text
observation
correlation
attribution
lifetime-violation
retainer-confirmed
causality-confirmed
```

Attribution quality is separate from evidence level:

```text
deterministic
framework-reported
source-attributed
temporal-inference
heuristic
unknown
```

Never turn:

```text
temporal proximity
shared trace
parent-child structure
heuristic source mapping
```

into proof of causality.

---

## 8. Framework capability model

Capabilities include:

```text
owner-lifecycle
update-lifecycle
update-cause
state-change
render-timing
source-location
reactive-dependency
resource-ownership
effect-lifecycle
```

Support levels must reflect reality:

```text
deterministic
framework-reported
partial
inferred
unsupported
```

Do not make React/Vue/Angular pretend to expose Lit semantics.

---

## 9. Original Lit product capabilities that matter

The mature Lit toolkit is not just a collector library. It includes a usable investigation workflow:

```text
Summary / health
Perf
Prop Audit
Inspector
Events
Slow API
Console
Vitals
Network
Cycle detection
Memory/resource lifetime
Workflow baseline
Pinpoint
Fix Table
Evidence/AI handoff
HTML/report export
History/comparison
Falcor-specific analysis
```

`LdsDebugPanel.js` is therefore a product surface, not disposable UI.

`lit/custom/ui-platform/**` is also mandatory for the Main Platform application:

```text
AciPlugin
FalcorDecoder
FalcorNetworkEnhancer
SyndigoSlowApiPlugin
compat
index
```

---

## 10. Current architectural gap

The generic intelligence kernel is meaningful, but the mature Lit collectors and new UREP pipeline are still partly parallel systems.

Examples:

```text
legacy perf       → __LDS_PERF__
legacy network    → __LDS_NETWORK_LOG__
legacy errors     → __LDS_ERRORS__
legacy memory     → legacy resource structures
legacy events     → __LDS_EVENTS_TIMELINE__
```

These do not yet all flow automatically through:

```text
UREP
→ Privacy
→ Evidence Graph
→ Root Cause
→ Recorder
→ Capsule
→ Verification
```

Therefore do not claim the new kernel has fully replaced the advanced Lit product.

---

## 11. Recommended next sequence

Before adding many more framework adapters, priority should be:

### A. Baseline preservation/parity

Ensure original product surfaces remain present and buildable, especially:

```text
LdsDebugPanel.js
panel package export/build target
custom/ui-platform
feature docs
important original guides/build assets
```

Do this as preservation work, not redesign.

### B. Mission 09.5 — Lit Collector → UREP Integration

Prove one real end-to-end workflow:

```text
real Lit component interaction
        ↓
perf/state/network/resource/error evidence
        ↓
UREP
        ↓
Privacy
        ↓
EvidenceStore
        ↓
Evidence Graph / Root Cause
        ↓
Flight Recorder
        ↓
Evidence Capsule
        ↓
fix
        ↓
replay
        ↓
verification
```

The goal is integration, not rewriting every collector at once.

### C. Mission 10 — Vue Production Adapter

Only after the Lit pipeline has a proven end-to-end path.

---

## 12. Engineering execution rules

When implementing a mission:

1. Inspect current `main` first.
2. Identify whether touched files are baseline-owned or new-runtime files.
3. For baseline files, compare against the canonical baseline before editing.
4. Freeze scope.
5. Implement useful code first.
6. Add focused tests.
7. Run syntax/import/build checks for the touched surface.
8. Keep documentation concise.
9. Prefer one mission commit; use a second only for a real hardening defect.
10. Stop once acceptance criteria pass.

Do not enable GitHub Actions.

Do not add paid/cloud dependencies.

Keep the core local-first, bounded, and zero-additional-cost.

---

## 13. Validation honesty

Do not report a test/build as passed unless it was actually executed.

Distinguish clearly between:

```text
static review
focused unit execution
package import test
Rollup build
browser integration test
real Main Platform validation
```

A module being syntactically valid is not equivalent to the real application working.

---

## 14. Diff discipline

For original baseline files, a reviewer should be able to compare against the ZIP/baseline and quickly understand every difference.

Good:

```text
original file
+ 5–30 obvious lines required for the new capability
```

Bad:

```text
same behavior rewritten
indentation changed everywhere
comments reordered
functions compressed
hundreds of unrelated diff lines
```

When possible, add generic capability in new files and connect it to baseline code through small integration points.

---

## 15. Product decision rule

When choosing between:

```text
A) cleaner generic abstraction that weakens the original product
B) slightly richer architecture that preserves the original product and enables generic reuse
```

choose **B**.

The product thesis is:

> Preserve the advanced Lit/Main Platform debugging experience, extract its intelligence into framework-neutral primitives, and then let React/Vue/Angular consume those primitives honestly according to what each framework can actually observe.

---

## 16. Before changing anything

Use this short checklist:

```text
[ ] Is this baseline-owned code?
[ ] Am I preserving Main Platform compatibility?
[ ] Am I preserving panel/product behavior?
[ ] Is the evidence strength honest?
[ ] Can this be implemented with a smaller diff?
[ ] Am I changing only what this mission needs?
[ ] Do focused tests prove the contract?
```

If all seven are satisfied, proceed.
