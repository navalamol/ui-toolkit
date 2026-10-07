# lit-debug-suite

Runtime diagnostics and Runtime Intelligence for Lit applications, with UI Platform/Syndigo integration.

## What this tool is for

The original LDS/RUF toolkit gives you powerful diagnostic views such as performance, network, memory, events, Pinpoint and Falcor.

Runtime Intelligence adds one layer above those tools:

```text
many runtime signals
        ↓
find the meaningful incident
        ↓
connect related evidence
        ↓
show one simple developer answer
```

The default experience should answer only:

```text
What happened?
What is the likely cause?
Where should I look?
What was the impact?
What should I do next?
```

Raw UREP event IDs, correlations and forensic metadata are internal evidence. They are not intended to be the normal developer UI.

## Package

The npm package lives in this `lit/` directory and is linked/published as `lit-debug-suite`.

```js
import { LitDebugMixin } from 'lit-debug-suite';
import 'lit-debug-suite/panel';
import 'lit-debug-suite/custom/ui-platform';
```

## Local development with npm link

From this repository:

```bash
cd runtime-intelligence/lit
npm install
npm run build
npm link
```

Then from `ui-platform`:

```bash
npm unlink lit-debug-suite
npm link lit-debug-suite
npm ls lit-debug-suite
```

`npm ls lit-debug-suite` should resolve to this local `runtime-intelligence/lit` package.

If the old toolkit still owns the global link:

```bash
cd <old-toolkit>/lit
npm unlink -g lit-debug-suite

cd <runtime-intelligence>/lit
npm link
```

Then link again inside `ui-platform`.

## UI Platform integration

### RufElement

Integrate once in the shared Lit base class, not in hundreds of components.

```js
import { LitElement } from 'lit';
import { LitDebugMixin } from 'lit-debug-suite';

export class RufElement extends LitDebugMixin(LitElement) {
    // existing RufElement behavior
}
```

Existing components continue normally:

```js
class ProductEditor extends RufElement {
    // no Runtime Intelligence plumbing here
}
```

### UI Platform plugin

Import once from bootstrap/application code:

```js
import 'lit-debug-suite/custom/ui-platform';
```

This preserves Falcor decoding, DataObjectManager slow-API instrumentation, ACI helpers and legacy compatibility aliases.

### Panel

Import once:

```js
import 'lit-debug-suite/panel';
```

The existing LDS panel remains the product surface. Runtime Intelligence adds a compact answer card rather than replacing the panel.

## Enable diagnostics

Set flags before components initialize.

```js
window.__LDS_DEBUG__ = true;
```

Or selectively:

```js
window.__LDS_DEBUG__ = {
    intelligence: true,
    perf: true,
    network: true,
};
```

Runtime Intelligence only:

```js
window.__LDS_INTELLIGENCE_ENABLED__ = true;
```

## What you should see

Immediately after Runtime Intelligence starts:

```js
window.__LDS_INTELLIGENCE__
```

should be a small developer-facing object similar to:

```js
{
  status: 'ready',
  headline: 'Runtime Intelligence is ready',
  nextAction: 'Reproduce the UI problem you want to investigate.'
}
```

After a qualifying slow Lit update or runtime error it becomes a compact finding:

```js
{
  status: 'incident-captured',
  headline: 'Slow UI update detected',
  problem: 'product-grid rendered slowly (716 ms)',
  likelyCause: 'ProductEditor.value is the strongest related cause...',
  confidence: 'High confidence',
  source: 'src/product-editor.js:418',
  impact: ['716 ms render', '14 renders', '6 network requests'],
  nextAction: 'Inspect src/product-editor.js:418 around ProductEditor.value.'
}
```

The panel shows the same information in human-readable form.

## When you need technical evidence

Normal developers should not need the raw event graph.

For forensic debugging, AI handoff, or deep investigation only:

```js
window.__LDS_INTELLIGENCE_PIPELINE__.exportCapsule()
```

The Evidence Capsule is bounded and privacy-sanitized. It keeps only a limited number of evidence references instead of copying every recorded event into the public UI model.

The underlying evidence store is still available for advanced debugging:

```js
window.__LDS_EVIDENCE__()
```

Treat this as an advanced/internal view, not the primary UX.

## Memory and diagnostic-safety model

Runtime diagnostics must never become the application's problem.

Current safeguards include:

- EvidenceStore is bounded; old evidence is evicted.
- Incident recorder is bounded by count and time window.
- the public `__LDS_INTELLIGENCE__` object is compact and does not contain the full capsule/event graph.
- Evidence Capsule references are capped; total event count is preserved separately.
- causal-chain references are capped.
- raw runtime payloads are excluded from exported evidence.
- privacy sanitization runs before evidence export.
- diagnostic subscriber failures are isolated from application runtime.

This means rich evidence exists when needed, but the normal developer view remains small.

## Baseline vs upgraded version

### Baseline LDS/RUF

Best at answering:

```text
What is slow?
What requests happened?
What events fired?
What leaked?
What does Pinpoint show?
```

### Runtime Intelligence upgrade

Adds:

```text
Which signals belong to the same incident?
What is the strongest likely cause?
How strong is the evidence?
Where should the developer look first?
Did the fix actually improve the problem?
```

It does not replace the mature diagnostic tabs. It turns their signals into a higher-level explanation.

## Recommended validation

After linking the upgraded package:

1. Enable `window.__LDS_DEBUG__ = true` before application startup.
2. Confirm the old panel/tabs still work.
3. Confirm `window.__LDS_INTELLIGENCE__.status === 'ready'`.
4. Exercise normal UI Platform workflows.
5. Trigger a real slow Lit render (>=500 ms) or runtime error.
6. Confirm the panel shows Problem / Likely cause / Where / Impact / Next.
7. Confirm `window.__LDS_INTELLIGENCE__` remains compact.
8. Only for deep investigation, inspect `window.__LDS_INTELLIGENCE_PIPELINE__.exportCapsule()`.

A failed network request alone currently enriches evidence but does not create an incident. This prevents random 404/offline noise from being promoted to a root-cause finding.

## Architecture rule

UI Platform consumes the product integration surface:

```text
UI Platform → RufElement → LitDebugMixin → diagnostics/intelligence
```

Do not manually assemble EvidenceStore, EvidenceGraph, RootCauseGrouper or LitIntelligencePipeline inside business components.

## Validation note

Source/package contracts are reviewed in the repository, but the final browser/runtime validation must still be performed in the real UI Platform environment.
