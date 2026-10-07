# Mission 09.5 — Lit Collector → UREP End-to-End Integration

Status: IMPLEMENTATION COMPLETE — EXECUTABLE/BROWSER REVIEW CHECKPOINT PENDING

## Delivered

The mature Lit diagnostics now feed the framework-neutral Runtime Intelligence path without duplicating Lit owner/update lifecycle evidence.

Primary error path:

`Lit component/update → LdsErrorBoundary → legacy collector bridge → EvidenceStore privacy boundary → EvidenceGraph → RootCauseGrouper → IncidentFlightRecorder → Evidence Capsule → existing LDS Pinpoint presentation bridge → panel replay verification handoff`

Additional Mission 09.5 continuation paths:

- `LitAdapter UPDATE_COMPLETED(durationMs) → configurable slow-update analysis policy → rolling recorder snapshot → graph/root cause → capsule → existing LDS panel presentation`
- `LdsNetwork completion → small legacy observer seam → privacy-safe NETWORK_COMPLETED UREP evidence → same EvidenceStore/recorder substrate`

## Key decisions

- `LitAdapter` remains the sole owner of Lit owner/update lifecycle evidence.
- The error collector bridge emits only collector-specific `error` evidence and correlates it to the latest Lit update request/state change.
- Slow-update analysis uses the existing UREP `UPDATE_COMPLETED.payload.durationMs`; it does not duplicate the legacy `perf.js` measurement.
- The default slow-update threshold is 500 ms and is constructor-configurable.
- Errors remain the hard `IncidentFlightRecorder` freeze trigger. A slow update is analyzed from the rolling recorder snapshot without freezing it, so a later runtime error cannot be hidden by an earlier performance symptom.
- Legacy `perf.js` continues to mean connect-to-first-render TTI. If it is bridged later, that distinct semantic must be preserved explicitly.
- Intelligence recording/analysis/panel presentation is opt-in again through `_toolEnabled('intelligence')` / `window.__LDS_INTELLIGENCE_ENABLED__` or the normal master debug flag semantics.
- Network bridging adds an observer seam to the existing collector rather than patching fetch/XHR a second time or polling global arrays.
- Network UREP payloads deliberately omit full URL, query string, decoder output, request body and raw error text before the EvidenceStore privacy boundary.
- Network completion enriches the evidence timeline but does not independently freeze an incident in this mission.
- The existing debug panel remains the product surface. A transitional presentation bridge augments it at runtime instead of creating a second diagnostics UI or modifying the restored canonical panel source.
- Panel replay completion is handed back to the generic pipeline as verification metadata and is included in the refreshed Evidence Capsule.
- Privacy is applied first by `EvidenceStore` and again at Evidence Capsule export boundaries.

## Regression coverage

`lit/test/unit/lit-intelligence-pipeline.test.mjs` covers:

- real Lit owner/update → error bridge → UREP → incident → graph/root cause → capsule → verification,
- no duplicate owner/update lifecycle evidence,
- qualifying UREP slow-update analysis,
- slow update does not consume the recorder and a later runtime error still wins/freeze-captures,
- below-threshold update does not become an incident.

`lit/test/unit/network-evidence-bridge.test.mjs` covers privacy-minimized network completion evidence and confirms raw URL/query/decoder/error fields do not cross the bridge.

`lit/test/unit/root-cause-review-hardening.test.mjs` covers:

- causality-confirmed cluster strength,
- deterministic earlier-sequence tie-break when candidate scores are equal,
- intelligence opt-in gate semantics.

The existing baseline compatibility regression continues to protect the canonical panel source/package/build wiring.

## Claude review loop

The independent review response, accepted/rejected recommendations, rationale, and ongoing strategic-review protocol are recorded in:

`docs/CLAUDE-REVIEW-LOOP-AND-09.5-DECISIONS.md`

This review loop is now a project practice at strategic checkpoints: implement → independent review → reconcile against actual `main` → accept/reject with justification → close only when evidence supports closure.

## Transitional debt intentionally retained

`panel-intelligence-presentation.js` still wraps the panel's `updated()` and private `_completeReplay()` methods. This is intentionally retained during compatibility-sensitive Mission 09.5 so the restored canonical panel remains untouched.

A future panel integration milestone should replace the `_completeReplay` wrapper with a stable replay-complete event/public hook. It should not be mixed into this mission unless executable/browser review proves the current bridge unsafe.

No public `analyzeIncident()` API was added because there is not yet a real consumer that needs imperative analysis. The evidence-driven path remains the product contract.

## Validation honesty

This GitHub connector session does not provide an executable repository checkout. Therefore `npm test`, `npm run build`, and browser behavior were not executed here and are not claimed as passing.

Mission 09.5 implementation is code-complete for review. Final closure requires the exact reviewed commit to pass an executable test/build checkpoint and a focused browser check of:

1. intelligence disabled → no recorder/panel bridge startup,
2. intelligence enabled → owner/update evidence is captured from first connection,
3. runtime error → incident/capsule/panel summary,
4. slow update ≥ threshold → `lit-slow-update` analysis without consuming the crash recorder,
5. a runtime error after a slow update still becomes the frozen incident,
6. network enabled + intelligence enabled → privacy-safe `NETWORK_COMPLETED` evidence,
7. replay verification → pipeline snapshot/capsule update,
8. canonical panel behavior remains intact.

Mission 10 / Vue should start only after that checkpoint, unless the user explicitly decides to override the closure gate.
