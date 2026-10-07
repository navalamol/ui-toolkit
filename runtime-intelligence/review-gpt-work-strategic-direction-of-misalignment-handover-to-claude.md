# Plan: Runtime Intelligence — Evidence Honesty, Scoring Fix, Folder Reorganisation

## Context

After real-world validation inside UI Platform, the `✨ Intelligence` tab surfaced a "root cause" the user considered irrelevant. The immediate visible problem is **evidence honesty**: the system promotes temporal/structural correlation to a "Likely cause" label even when confidence is only `correlated`. Separately, two core modules (`diagnostic-policy.js`, `resource-ownership-ledger.js`) are architecturally correct but have zero active callers in the current intelligence pipeline — they should be **deferred, not deleted**, so future work can pick them up cleanly.

The generic architecture (FrameworkAdapter, ReactAdapter, UREP) is **intentionally kept active** — the system must remain Lit + React + future framework neutral. React work is explicitly coming soon.

---

## Folder restructure (do first — everything else patches clean files)

### Create `src/archive/` — modules that are not currently useful
Move here: `src/core/diagnostic-policy.js`
- Add `src/archive/README.md` explaining: files here are detached from the active pipeline; all import references have been commented out; may be reconsidered in future

### Create `src/future/` — modules valuable eventually but not active yet
Move here: `src/core/resource-ownership-ledger.js`
- Add `src/future/README.md` explaining: resource lifetime violation detection — the highest-value deterministic Intelligence scenario; reconnect when `memory.js` emits `RESOURCE_ACQUIRED`/`RESOURCE_RELEASED` UREP events

### Comment out (do NOT delete) their barrel exports in `src/index.js`
Lines 39-45 (resource-ownership-ledger imports) and lines 57-68 (diagnostic-policy imports) — wrap each block in:
```js
// DEFERRED — moved to src/future/resource-ownership-ledger.js
// export { RESOURCE_LEDGER_SCHEMA_VERSION, ResourceStatus, ... } from './core/resource-ownership-ledger.js';

// ARCHIVED — moved to src/archive/diagnostic-policy.js  
// export { POLICY_ENGINE_SCHEMA_VERSION, RuleKind, ... } from './core/diagnostic-policy.js';
```

### Move matching test files
- `test/unit/diagnostic-policy.test.mjs` → `test/unit/archive/diagnostic-policy.test.mjs`
- `test/unit/resource-ownership-ledger.test.mjs` → `test/unit/future/resource-ownership-ledger.test.mjs`
- `test/unit/audit-hardening.test.mjs` line 12: comment out `RuntimeResourceOwnershipLedger` import; skip any test that exclusively uses it (add `// DEFERRED` comment before skip)
- `test/unit/package-integrity.test.mjs` line 34: comment out the `'RuntimeResourceOwnershipLedger'` string from the expected-exports check

---

## Change 1 — Evidence honesty: rename labels to match actual confidence (P0)

**Problem:** `likelyCause` wording and the "Likely cause" panel label are shown even when cluster `strength === 'correlated'` (the near-universal real case). This is the direct cause of the user's complaint.

**File: `src/integration/lit/developer-intelligence-summary.js`**

In `createDeveloperIntelligenceSummary()`, replace the `likelyCause` string construction:

```js
// CURRENT (always says "strongest related cause"):
const likelyCause = rootLabel
    ? `${rootLabel} is the strongest related cause found before this problem.`
    : 'The problem was captured, but there is not enough trustworthy evidence yet to name a root cause.';

// REPLACE WITH:
const _strength = rootCause?.strength || 'correlated';
const likelyCause = rootLabel
    ? _strength === 'confirmed'
        ? `${rootLabel} caused this problem — causality confirmed.`
        : _strength === 'attributed'
            ? `${rootLabel} is a likely contributor — strong evidence links it to this problem.`
            : `${rootLabel} was the strongest signal active before this problem. This is a correlation, not a confirmed cause.`
    : 'The problem was captured, but there is not enough evidence yet to identify a contributor.';
```

**File: `src/integration/lit/panel-intelligence-presentation.js`**

In `_renderFinding()`, make the label dynamic based on `model.confidence`:

```js
// CURRENT:
html`<strong style="color:#89b4fa;">Likely cause</strong>`

// REPLACE WITH a helper before the function:
function _causeLabel(confidence) {
    if (confidence === 'Confirmed') return 'Confirmed cause';
    if (confidence === 'High confidence') return 'Likely cause';
    return 'Strongest signal';
}

// Then in the template:
html`<strong style="color:#89b4fa;">${_causeLabel(model.confidence)}</strong>`
```

---

## Change 2 — Root-cause scoring: discount structural ancestry (P1)

**Problem:** `_candidateScore()` in `src/core/root-cause.js` counts `descendants.length` which rewards a node for being high in the Lit component tree (many PARENT-reachable children), not for actually causing anything. A top-level `STATE_CHANGED` event always wins on large trees regardless of causation.

**File: `src/core/root-cause.js`**

Split the descendant count into causes-only vs structural, and heavily discount the structural component:

```js
// CURRENT:
function _reachable(graph, id) {
  return graph.descendants(id, { relations: [EdgeRelation.CAUSES, EdgeRelation.PARENT] });
}

function _candidateScore(graph, event, componentIds) {
  const descendants = _reachable(graph, event.id).filter(item => componentIds.has(item.id));
  const causalOut = ...;
  const incomingCausal = ...;
  const symptomReach = descendants.filter(...).length;
  const evidenceBonus = ...;
  return (_rootTypeWeight[event.type] || 0) + descendants.length + (causalOut * 2) + (symptomReach * 2) + evidenceBonus - (incomingCausal * 2);
}

// REPLACE WITH:
function _causesReachable(graph, id) {
  return graph.descendants(id, { relations: [EdgeRelation.CAUSES] });
}

function _structuralReachable(graph, id) {
  return graph.descendants(id, { relations: [EdgeRelation.PARENT] });
}

function _candidateScore(graph, event, componentIds) {
  const causalDesc = _causesReachable(graph, event.id).filter(item => componentIds.has(item.id));
  const structDesc = _structuralReachable(graph, event.id).filter(item => componentIds.has(item.id));
  const causalOut = graph.outgoing(event.id).filter(edge => edge.relation === EdgeRelation.CAUSES).length;
  const incomingCausal = graph.incoming(event.id).filter(edge => edge.relation === EdgeRelation.CAUSES).length;
  const symptomReach = causalDesc.filter(item => _symptomTypes.has(item.type)).length;
  const evidenceBonus = event.evidence?.level === EvidenceLevel.CAUSALITY_CONFIRMED ? 6
    : event.evidence?.level === EvidenceLevel.ATTRIBUTION ? 3
    : event.evidence?.level === EvidenceLevel.CORRELATION ? 1 : 0;
  // Structural ancestry (PARENT) contributes minimally — tree position ≠ causation
  return (_rootTypeWeight[event.type] || 0)
    + (causalDesc.length * 2)          // strong: explicit causal reachability
    + Math.floor(structDesc.length * 0.1) // weak: structural ancestry (topological)
    + (causalOut * 3)
    + (symptomReach * 2)
    + evidenceBonus
    - (incomingCausal * 2);
}
```

Remove the old `_reachable` function (replaced by the two above). Update `_clusterStrength` if it used `_reachable` (it doesn't — it uses `graph.edges()` directly, so no change needed).

---

## Change 3 — Decouple `_completeReplay` private method patch (P2)

**Problem:** `panel-intelligence-presentation.js` wraps `LdsDebugPanel.prototype._completeReplay`, a `_`-prefixed private method. Any panel refactor silently breaks verification feedback.

**File: `src/panel/LdsDebugPanel.js`**

Find the `_completeReplay()` method. At the end of its body (just before the return or as the last statement), dispatch:
```js
this.dispatchEvent(new CustomEvent('lds-replay-complete', {
  detail: { comparison: this._replayState?.comparison, status: this._replayState?.status },
  bubbles: true,
  composed: true,
}));
```

**File: `src/integration/lit/panel-intelligence-presentation.js`**

In `_patchPanelClass()`, remove the `proto._completeReplay` patch block entirely (the `if (typeof originalCompleteReplay === 'function') { ... }` block, approximately lines 203-219).

In `installLitIntelligencePanelPresentation()`, add a document-level listener alongside the existing `lds-intelligence-updated` listener:
```js
if (!target.__LDS_INTELLIGENCE_PANEL_BRIDGE_INSTALLED__) {
  target.__LDS_INTELLIGENCE_PANEL_BRIDGE_INSTALLED__ = true;
  target.addEventListener?.('lds-intelligence-updated', () => { ... }); // existing
  target.addEventListener?.('lds-replay-complete', (e) => {
    const { comparison, status } = e.detail || {};
    if (status === 'done' && comparison) {
      target.__LDS_INTELLIGENCE_PIPELINE__?.recordVerification?.({
        source: 'panel-replay',
        outcome: comparison.overallVerified ? 'confirmed' : 'not-confirmed',
        confirmed: comparison.overallVerified === true,
        metrics: comparison.metrics || [],
        comparedAt: comparison.comparedAt || new Date().toISOString(),
      });
    }
  });
}
```

---

## Change 4 — Add missing `confirmed` cluster strength test (P2)

**File: `test/unit/audit-hardening.test.mjs`**

Add after the existing cluster-strength tests:
```js
test('causality-confirmed edge produces confirmed cluster strength', () => {
  const store = new EvidenceStore({ maxEvents: 20 });
  const e1 = store.record({ type: RuntimeEventType.STATE_CHANGED, owner: { id: 'o1', name: 'Alpha' }, evidence: { level: EvidenceLevel.CAUSALITY_CONFIRMED } });
  const e2 = store.record({ type: RuntimeEventType.UPDATE_COMPLETED, owner: { id: 'o1', name: 'Alpha' }, causedByEventId: e1.id });
  const graph = new EvidenceGraph([...store.snapshot()]);
  // Force CAUSALITY_CONFIRMED on the edge
  graph.addEdge({ fromEventId: e1.id, toEventId: e2.id, relation: EdgeRelation.CAUSES, evidence: { level: EvidenceLevel.CAUSALITY_CONFIRMED } });
  const grouper = new RootCauseGrouper({ minClusterSize: 2 });
  const clusters = grouper.group(graph);
  assert.ok(clusters.length > 0, 'should produce a cluster');
  assert.equal(clusters[0].strength, 'confirmed');
});
```

---

## Verification

```bash
cd lit
npm test          # should pass all non-archived tests; 0 failures
npm run build     # should succeed cleanly
npm pack          # tarball should NOT include archive/ or future/ in barrel exports
```

Then validate in UI Platform with two real scenarios:
1. **Runtime error scenario**: trigger a known `RufElement` crash → Intelligence tab should show "Runtime error captured" with "Strongest signal" (not "Likely cause") if confidence is correlated
2. **Slow render scenario**: force a >500ms update → check the label is honest, and the component named is genuinely related to what was slow, not just a topologically high ancestor

If both scenarios produce honest, useful output, the product surface is validated for the first time.

---

## File change summary

| File | Action |
|---|---|
| `src/core/diagnostic-policy.js` | MOVE → `src/archive/diagnostic-policy.js` |
| `src/core/resource-ownership-ledger.js` | MOVE → `src/future/resource-ownership-ledger.js` |
| `src/archive/README.md` | CREATE (new) |
| `src/future/README.md` | CREATE (new) |
| `src/index.js` | COMMENT OUT lines 39-45 and 57-68 |
| `test/unit/diagnostic-policy.test.mjs` | MOVE → `test/unit/archive/` |
| `test/unit/resource-ownership-ledger.test.mjs` | MOVE → `test/unit/future/` |
| `test/unit/audit-hardening.test.mjs` | Comment out ResourceOwnershipLedger import (line 12) + skipped tests; add confirmed-strength test |
| `test/unit/package-integrity.test.mjs` | Comment out `'RuntimeResourceOwnershipLedger'` from expected-exports list (line 34) |
| `src/integration/lit/developer-intelligence-summary.js` | Edit `likelyCause` wording (strength-conditional) |
| `src/integration/lit/panel-intelligence-presentation.js` | Add `_causeLabel()` helper; make label dynamic; replace `_completeReplay` patch with CustomEvent listener |
| `src/panel/LdsDebugPanel.js` | Dispatch `lds-replay-complete` CustomEvent at end of `_completeReplay()` |
| `src/core/root-cause.js` | Replace `_reachable` with `_causesReachable` + `_structuralReachable`; update `_candidateScore` formula |
