# Mission 12A — DomDuplicationAdvisor + panel-opportunities-presentation.js

Status: OPEN

## Pain
Developers create `<my-tooltip>` per list item (47 instances) instead of one shared instance at
the parent level. Current tool has no DOM structural duplication detection at all.

## This mission also creates the shared "Opportunities" tab
Mission 12A owns `panel-opportunities-presentation.js`. Later missions (12B–12E) only add their
own `_renderXxxSection()` function to that file and register in `_renderOpportunitiesTab()`.

---

## Existing infrastructure to reuse
- `src/core/update-budget-monitor.js` — exact lifecycle pattern (`#active`, `start/stop` guards)
- `src/core/evidence-store.js` — `store.emit()`, `store.subscribe()`, `store.snapshot()`
- `src/core/evidence-protocol.js` — `RuntimeEventType.DIAGNOSTIC`, `EvidenceLevel`, `AttributionQuality`
- `src/integration/lit/panel-intelligence-presentation.js` — exact template for tab injection
  (copy `_ensureTabButton`, `_patchPanelClass`, `_syncAll`, `installLit*PanelPresentation`)
- `src/integration/lit/LitIntelligencePipeline.js` — wire new advisor alongside existing ones

---

## What to build

### New file 1: `src/core/dom-duplication-advisor.js`

```js
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

const SINGLETON_ROLES = Object.freeze(['dialog', 'tooltip', 'alertdialog', 'menu']);
const SINGLETON_PATTERNS = Object.freeze([
    'modal', 'dialog', 'overlay', 'tooltip', 'popup', 'drawer', 'flyout', 'sheet',
]);

class DomDuplicationAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #minInstances;
    #mutationObserver = null;
    #debounceId = null;
    #DEBOUNCE_MS = 300;

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        minInstances = 3,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('DomDuplicationAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#minInstances = minInstances;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        const doc = this.#windowTarget?.document;
        if (doc?.body) {
            this.#mutationObserver = new (this.#windowTarget.MutationObserver)(
                () => this.#scheduleScan()
            );
            this.#mutationObserver.observe(doc.body, { subtree: true, childList: true });
        }
        this.#scanOnce();
        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#mutationObserver) { this.#mutationObserver.disconnect(); this.#mutationObserver = null; }
        if (this.#debounceId != null) { clearTimeout(this.#debounceId); this.#debounceId = null; }
        return this;
    }

    scan() { this.#scanOnce(); }  // public entry point for testing

    #scheduleScan() {
        if (this.#debounceId != null) clearTimeout(this.#debounceId);
        this.#debounceId = setTimeout(() => { this.#debounceId = null; this.#scanOnce(); }, this.#DEBOUNCE_MS);
    }

    #scanOnce() {
        if (!this.#active && this.#windowTarget) return;
        const doc = this.#windowTarget?.document;
        if (!doc) return;

        try {
            const all = doc.querySelectorAll('*');
            const byTag = new Map();

            for (const el of all) {
                if (!this.#isSingletonElement(el)) continue;
                const tag = el.localName;
                if (!byTag.has(tag)) byTag.set(tag, []);
                byTag.get(tag).push(el);
            }

            for (const [tag, elements] of byTag) {
                if (elements.length < this.#minInstances) continue;
                const ancestor = this.#findLowestCommonAncestor(elements);
                const ancestorTag = ancestor?.localName || 'body';
                const identicalContent = this.#identicalContentSignal(elements);
                const strength = identicalContent ? 'high' : 'medium';

                this.#store.emit({
                    type: RuntimeEventType.DIAGNOSTIC,
                    owner: null,
                    correlation: { causedByEventId: null },
                    evidence: {
                        level: EvidenceLevel.OBSERVATION,
                        attribution: AttributionQuality.HEURISTIC,
                        confidence: identicalContent ? 0.7 : 0.5,
                    },
                    payload: {
                        domDuplication: true,
                        duplicateTag: tag,
                        instanceCount: elements.length,
                        commonAncestorTag: ancestorTag,
                        identicalContent,
                        strength,
                    },
                });
            }
        } catch (_) {
            // never throw from a scan
        }
    }

    #isSingletonElement(el) {
        const role = el.getAttribute?.('role');
        if (role && SINGLETON_ROLES.includes(role)) return true;
        const tag = el.localName;
        if (!tag.includes('-')) return false;  // only custom elements
        return SINGLETON_PATTERNS.some(p => tag.includes(p));
    }

    #findLowestCommonAncestor(elements) {
        if (elements.length === 0) return null;

        function ancestorChain(el) {
            const chain = [];
            let cur = el;
            let hops = 0;
            while (cur && hops < 100) {
                const root = cur.getRootNode?.();
                if (root instanceof ShadowRoot) {
                    cur = root.host;
                } else {
                    cur = cur.parentElement;
                }
                if (cur) chain.push(cur);
                hops++;
            }
            return chain;
        }

        const firstChain = ancestorChain(elements[0]);
        for (const ancestor of firstChain) {
            if (elements.every(el => ancestor.contains(el))) return ancestor;
        }
        return null;
    }

    #identicalContentSignal(elements) {
        if (elements.length < 2) return false;
        try {
            const lengths = elements.map(el => el.innerHTML?.length ?? 0);
            const min = Math.min(...lengths);
            const max = Math.max(...lengths);
            if (min === 0) return false;
            return (max - min) / min <= 0.10;  // within 10%
        } catch (_) {
            return false;
        }
    }
}

export { DomDuplicationAdvisor };
```

---

### New file 2: `src/integration/lit/panel-opportunities-presentation.js`

This file is the panel presentation layer for ALL 5 opportunity advisors. Mission 12A creates it
with the tab skeleton and the DomDuplication section. Missions 12B–12E each ADD ONE FUNCTION to
this file (their `_renderXxxSection`) and one call in `_renderOpportunitiesTab()`.

```js
import { html } from 'lit';

const OPPORTUNITIES_TAB_KEY = 'opportunities';

// ── Section renderers (add one per mission below) ─────────────────────────

function _renderDomDuplicationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const hits = (store.snapshot?.({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.domDuplication === true);
    if (hits.length === 0) return '';

    // Deduplicate by duplicateTag — keep highest instanceCount
    const byTag = new Map();
    for (const h of hits) {
        const p = h.payload;
        const prev = byTag.get(p.duplicateTag);
        if (!prev || p.instanceCount > prev.instanceCount) byTag.set(p.duplicateTag, p);
    }
    const entries = [...byTag.values()].sort((a, b) => b.instanceCount - a.instanceCount);

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #f38ba8;border-radius:7px;padding:8px 10px;" open>
            <summary style="cursor:pointer;color:#f38ba8;font-weight:700;">
                🔁 DOM Duplication — ${entries.length} pattern${entries.length !== 1 ? 's' : ''} detected
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${entries.map(p => html`
                    <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div><code style="color:#f38ba8;">&lt;${p.duplicateTag}&gt;</code> ×${p.instanceCount}
                        under <code style="color:#cba6f7;">&lt;${p.commonAncestorTag}&gt;</code>
                        ${p.identicalContent ? html`<span style="color:#a6e3a1;margin-left:6px;">· identical content</span>` : ''}
                        <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                        </div>
                        <div style="margin-top:4px;color:#6c7086;">
                            → Hoist one shared instance to <code style="color:#cba6f7;">&lt;${p.commonAncestorTag}&gt;</code> and toggle visibility/content via a property
                        </div>
                    </div>
                `)}
            </div>
        </details>
    `;
}

// ── Placeholder stubs — replaced when missions 12B–12E land ──────────────
function _renderVirtualizationSection(_target)   { return ''; }
function _renderPaintAdvisorSection(_target)      { return ''; }
function _renderWorkerOpportunitySection(_target) { return ''; }
function _renderIdleSchedulingSection(_target)    { return ''; }

// ── Main tab renderer ─────────────────────────────────────────────────────

function _renderOpportunitiesTab(target) {
    const hasDom  = (target?.__LDS_EVIDENCE_STORE__?.snapshot?.({ type: 'diagnostic' }) ?? [])
                     .some(e => e.payload?.domDuplication || e.payload?.virtualizationOpportunity ||
                                e.payload?.paintTiming || e.payload?.expensivePaint ||
                                e.payload?.workerOpportunity || e.payload?.idleOpportunity);

    return html`
        <div style="font-family:monospace;font-size:12px;color:#cdd6f4;padding:0 2px;">
            <div style="font-weight:700;color:#fab387;margin-bottom:10px;font-size:13px;">⚡ Opportunities</div>
            <div style="font-size:11px;color:#6c7086;margin-bottom:12px;line-height:1.5;">
                Proactive structural and optimization analysis — distinct from the incident-driven
                Intelligence tab. Each section fires only when a real pattern is detected.
            </div>

            ${_renderDomDuplicationSection(target)}
            ${_renderVirtualizationSection(target)}
            ${_renderPaintAdvisorSection(target)}
            ${_renderWorkerOpportunitySection(target)}
            ${_renderIdleSchedulingSection(target)}

            ${!hasDom ? html`
                <div style="color:#585b70;font-size:11px;padding:16px 0;text-align:center;">
                    No opportunities detected yet — exercise the app to trigger analysis.
                </div>
            ` : ''}
        </div>
    `;
}

// ── Tab button injection (same pattern as panel-intelligence-presentation.js) ──

function _ensureTabButton(panel, target) {
    const root = panel?.shadowRoot;
    const tabs = root?.querySelector('.tabs');
    if (!tabs || root.querySelector('#lds-opportunities-tab')) return;

    const button = target.document.createElement('button');
    button.id = 'lds-opportunities-tab';
    button.className = `tab${panel._tab === OPPORTUNITIES_TAB_KEY ? ' active' : ''}`;
    button.textContent = '⚡ Opportunities';
    button.addEventListener('click', () => {
        if (typeof panel._setTab === 'function') panel._setTab(OPPORTUNITIES_TAB_KEY);
        else { panel._tab = OPPORTUNITIES_TAB_KEY; panel.requestUpdate?.(); }
    });

    // Insert AFTER the Intelligence tab button
    const intl = tabs.querySelector('#lds-intelligence-tab');
    if (intl?.nextSibling) tabs.insertBefore(button, intl.nextSibling);
    else tabs.appendChild(button);
}

function _syncTabButton(panel, target) {
    _ensureTabButton(panel, target);
    const btn = panel?.shadowRoot?.querySelector('#lds-opportunities-tab');
    if (btn) btn.className = `tab${panel._tab === OPPORTUNITIES_TAB_KEY ? ' active' : ''}`;
}

function _syncAll(target) {
    const panels = target?.document?.querySelectorAll?.('lds-debug-panel') || [];
    for (const panel of panels) {
        _syncTabButton(panel, target);
        if (panel._tab === OPPORTUNITIES_TAB_KEY) panel.requestUpdate?.();
    }
}

function _patchPanelClass(target) {
    const Panel = target?.customElements?.get?.('lds-debug-panel');
    if (!Panel || Panel.prototype.__ldsOpportunitiesPresentationPatched) return !!Panel;

    const proto = Panel.prototype;

    const originalConnected = proto.connectedCallback;
    proto.connectedCallback = function (...args) {
        const result = originalConnected?.apply(this, args);
        Promise.resolve(this.updateComplete).finally(() => _syncTabButton(this, target));
        return result;
    };

    const originalUpdated = proto.updated;
    proto.updated = function (...args) {
        const result = originalUpdated?.apply(this, args);
        _syncTabButton(this, target);
        return result;
    };

    const originalRenderContent = proto._renderContent;
    proto._renderContent = function (...args) {
        if (this._tab === OPPORTUNITIES_TAB_KEY) {
            return html`<div class="tab-content">${_renderOpportunitiesTab(target)}</div>`;
        }
        return originalRenderContent?.apply(this, args);
    };

    Object.defineProperty(proto, '__ldsOpportunitiesPresentationPatched', {
        value: true, configurable: false, enumerable: false, writable: false,
    });

    _syncAll(target);
    return true;
}

function installLitOpportunitiesPanelPresentation({
    target = typeof window !== 'undefined' ? window : null,
} = {}) {
    if (!target?.customElements) return false;

    if (!target.__LDS_OPPORTUNITIES_PANEL_BRIDGE_INSTALLED__) {
        target.__LDS_OPPORTUNITIES_PANEL_BRIDGE_INSTALLED__ = true;
        target.addEventListener?.('lds-intelligence-updated', () => {
            // Reuse the existing lds-intelligence-updated event (also dispatched by pipeline)
            const panels = target.document?.querySelectorAll?.('lds-debug-panel') || [];
            for (const panel of panels) {
                if (panel._tab === OPPORTUNITIES_TAB_KEY) panel.requestUpdate?.();
            }
        });
    }

    if (target.customElements.get('lds-debug-panel')) return _patchPanelClass(target);

    target.customElements.whenDefined?.('lds-debug-panel').then(() => _patchPanelClass(target));
    return false;
}

export { installLitOpportunitiesPanelPresentation };
```

---

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

Add at top (after existing imports):
```js
import { DomDuplicationAdvisor } from '../../core/dom-duplication-advisor.js';
import { installLitOpportunitiesPanelPresentation } from './panel-opportunities-presentation.js';
```

Add private field (after `#sequentialDetector`):
```js
#domDuplicationAdvisor = null;
```

Add in constructor (after `new FalcorCallGraph(...)` / `new SequentialApiDetector(...)`):
```js
this.#domDuplicationAdvisor = new DomDuplicationAdvisor({ store, windowTarget });
installLitOpportunitiesPanelPresentation({ target: windowTarget });
```

Add in `start()` (after `this.#sequentialDetector?.start()`):
```js
this.#domDuplicationAdvisor?.start();
```

Add in `stop()` (before `this.#sequentialDetector?.stop()`):
```js
this.#domDuplicationAdvisor?.stop();
```

Extend the DIAGNOSTIC early-return block in `#onEvidence()`:
```js
// Find the existing block that checks budgetViolation / networkCorrelation and add:
if (p?.domDuplication) {
    this.#dispatchPanelUpdate();
    return;
}
```

Add public accessor:
```js
get domDuplicationAdvisor() { return this.#domDuplicationAdvisor ?? null; }
```

---

### Modify: `src/panel/LdsDebugPanel.js` — `_buildPinpointIssues()`

Add at the end of the issues array assembly (before the final `.sort()`):
```js
// DOM Duplication
const domDupDiags = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.domDuplication === true)
    : [];
if (domDupDiags.length > 0) {
    const worst = domDupDiags.sort((a, b) => b.payload.instanceCount - a.payload.instanceCount)[0];
    const p = worst.payload;
    issues.push({
        id: `dom-dup-${p.duplicateTag}`,
        component: p.commonAncestorTag || '(shared ancestor)',
        filePath: _tagToFilePath(p.commonAncestorTag || ''),
        issueType: 'dom-duplication',
        severity: p.identicalContent ? 'high' : 'medium',
        details: `<${p.duplicateTag}> is instantiated ${p.instanceCount}× under <${p.commonAncestorTag}>${p.identicalContent ? ' with identical content' : ''}.`,
        callStacks: [],
        recommendation: `Hoist one shared <${p.duplicateTag}> instance to <${p.commonAncestorTag}> level. Toggle its content and visibility via a component property rather than mounting N instances.`,
        observed: { instanceCount: p.instanceCount, identicalContent: p.identicalContent },
    });
}
```

---

### Modify: `src/index.js`

Add export:
```js
export { DomDuplicationAdvisor } from './core/dom-duplication-advisor.js';
```

---

## Constraints
- MUST NOT import Lit or any framework adapter in `dom-duplication-advisor.js`
- MUST NOT use `causedByEventId` — this is structural heuristic, not causal evidence
- `#identicalContentSignal()` MUST be wrapped in try/catch — shadow DOM innerHTML may throw
- `#findLowestCommonAncestor()` MUST cap at 100 hops — unbounded walk is a perf risk
- Tab button must insert AFTER `#lds-intelligence-tab`, not before it
- Empty-state must render in Opportunities tab when no advisors have fired

---

## Tests (exact assertions)

File: `test/unit/dom-duplication-advisor.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { DomDuplicationAdvisor } from '../../src/core/dom-duplication-advisor.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';

function makeStore() { return new EvidenceStore({ maxEntries: 50 }); }

function makeWindow(elements = []) {
    // elements: [{ localName, getAttribute, parentElement, innerHTML, getRootNode }]
    return {
        MutationObserver: class { observe() {} disconnect() {} },
        document: {
            querySelectorAll: () => elements,
        },
    };
}
```

1. **No singleton-pattern elements → no DIAGNOSTIC**
   ```
   windowTarget: no elements matching SINGLETON_ROLES or SINGLETON_PATTERNS
   → store.snapshot({ type: 'diagnostic' }) returns []
   ```

2. **< minInstances (default 3) → no DIAGNOSTIC**
   ```
   windowTarget: 2 elements with localName 'x-modal' sharing a parent
   → no DIAGNOSTIC emitted
   ```

3. **>= minInstances → emits domDuplication:true with correct payload**
   ```
   windowTarget: 5 elements with localName 'x-tooltip', parent localName 'x-product-grid'
   → emits DIAGNOSTIC with:
       payload.domDuplication === true
       payload.duplicateTag === 'x-tooltip'
       payload.instanceCount === 5
       payload.commonAncestorTag === 'x-product-grid'
   ```

4. **identicalContent:true when innerHTML lengths within 10%**
   ```
   5 elements, innerHTML lengths: [100, 105, 98, 103, 101]
   → payload.identicalContent === true, payload.strength === 'high'
   ```

5. **stop() → no DIAGNOSTICs after stop**
   ```
   advisor.start(); advisor.stop(); advisor.scan();
   → store.snapshot({ type: 'diagnostic' }).filter(e => e.payload?.domDuplication) → []
   ```

---

## Framework extension path
React: `ReactAdapter` already emits `UPDATE_COMPLETED` and `STATE_CHANGED`. `DomDuplicationAdvisor`
requires no adapter at all — it reads the DOM directly. Wire by constructing it in
`ReactIntelligencePipeline` (future) the same way as `LitIntelligencePipeline`. No code changes
in the advisor itself.

---

## Gate checklist
- [ ] All 100+ existing tests still pass
- [ ] 5 new tests in `dom-duplication-advisor.test.mjs` pass
- [ ] `panel-opportunities-presentation.js` renders without error when no advisors have fired
- [ ] "⚡ Opportunities" tab button appears AFTER "✨ Intelligence" tab in panel
- [ ] Empty state shows "No opportunities detected yet" when Opportunities tab is empty
- [ ] `DomDuplicationAdvisor` exported from `src/index.js`
- [ ] Feature doc created: `docs/features/13-dom-duplication-advisor.md`
