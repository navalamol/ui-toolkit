# Mission 12B — VirtualizationAdvisor

Status: OPEN

## Pain
"Consider virtualising long lists" fires at >1500 total DOM nodes — no component, no list,
no off-screen ratio. Developers need to know which specific component renders which list,
how many items are off-screen, and what library to use.

## Prerequisite
Mission 12A must be complete. This mission adds one section to the existing
`panel-opportunities-presentation.js` created in 12A.

---

## Existing infrastructure to reuse
- `src/core/dom-duplication-advisor.js` (12A) — lifecycle + MutationObserver + debounce pattern to copy
- `src/core/evidence-protocol.js` — `RuntimeEventType.DIAGNOSTIC`, `EvidenceLevel.OBSERVATION`
- `src/integration/lit/panel-opportunities-presentation.js` — add `_renderVirtualizationSection`,
  replace the stub, and add call in `_renderOpportunitiesTab()`

---

## What to build

### New file: `src/core/virtualization-advisor.js`

```js
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class VirtualizationAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #minChildren;
    #offScreenThreshold;
    #mutationObserver = null;
    #debounceId = null;
    #emittedKeys = new Set();   // '<parentTag>|<childTag>' — cleared each scan
    #DEBOUNCE_MS = 300;
    #MAX_ANCESTOR_HOPS = 20;

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        minChildren = 50,
        offScreenThreshold = 0.7,
    } = {}) {
        if (!store || typeof store.emit !== 'function') {
            throw new TypeError('VirtualizationAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#minChildren = minChildren;
        this.#offScreenThreshold = offScreenThreshold;
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
        this.#emittedKeys.clear();
        return this;
    }

    scan() { this.#scanOnce(); }

    #scheduleScan() {
        if (this.#debounceId != null) clearTimeout(this.#debounceId);
        this.#debounceId = setTimeout(() => { this.#debounceId = null; this.#scanOnce(); }, this.#DEBOUNCE_MS);
    }

    #scanOnce() {
        const doc = this.#windowTarget?.document;
        if (!doc) return;
        this.#emittedKeys.clear();

        try {
            const all = doc.querySelectorAll('*');
            // Map: parentEl → Map<childTag, el[]>
            const parentMap = new Map();

            for (const el of all) {
                const parent = el.parentElement;
                if (!parent) continue;
                const childTag = el.localName;
                if (!parentMap.has(parent)) parentMap.set(parent, new Map());
                const tagMap = parentMap.get(parent);
                if (!tagMap.has(childTag)) tagMap.set(childTag, []);
                tagMap.get(childTag).push(el);
            }

            for (const [parent, tagMap] of parentMap) {
                for (const [childTag, children] of tagMap) {
                    if (children.length < this.#minChildren) continue;

                    const offCount = this.#offScreenCount(children);
                    const offRatio = offCount / children.length;
                    if (offRatio < this.#offScreenThreshold) continue;

                    const parentTag = this.#nearestCustomElementAncestor(parent) || parent.localName;
                    const key = `${parentTag}|${childTag}`;
                    if (this.#emittedKeys.has(key)) continue;
                    this.#emittedKeys.add(key);

                    const strength = this.#strengthFor(offRatio, children.length);

                    this.#store.emit({
                        type: RuntimeEventType.DIAGNOSTIC,
                        owner: null,
                        correlation: { causedByEventId: null },
                        evidence: {
                            level: EvidenceLevel.OBSERVATION,
                            attribution: AttributionQuality.HEURISTIC,
                            confidence: 0.7,
                        },
                        payload: {
                            virtualizationOpportunity: true,
                            childTag,
                            childCount: children.length,
                            offScreenRatio: Math.round(offRatio * 100) / 100,
                            parentTag,
                            strength,
                        },
                    });
                }
            }
        } catch (_) {
            // never throw from a scan
        }
    }

    #offScreenCount(elements) {
        const win = this.#windowTarget;
        if (!win) return 0;
        const vH = win.innerHeight ?? 0;
        const vW = win.innerWidth ?? 0;
        let count = 0;
        for (const el of elements) {
            try {
                const r = el.getBoundingClientRect();
                if (r.bottom <= 0 || r.top >= vH || r.right <= 0 || r.left >= vW) count++;
            } catch (_) {
                count++;
            }
        }
        return count;
    }

    #nearestCustomElementAncestor(el) {
        let cur = el;
        let hops = 0;
        while (cur && hops < this.#MAX_ANCESTOR_HOPS) {
            if (cur.localName?.includes('-')) return cur.localName;
            cur = cur.parentElement;
            hops++;
        }
        return null;
    }

    #strengthFor(offRatio, count) {
        if (offRatio >= 0.85 && count >= 100) return 'high';
        if (offRatio >= 0.7 && count >= 50) return 'medium';
        return 'low';
    }
}

export { VirtualizationAdvisor };
```

---

### Modify: `src/integration/lit/panel-opportunities-presentation.js`

Replace the existing stub:
```js
function _renderVirtualizationSection(_target) { return ''; }
```

With the full implementation:
```js
function _renderVirtualizationSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const hits = (store.snapshot?.({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.virtualizationOpportunity === true);
    if (hits.length === 0) return '';

    // Deduplicate by childTag — keep highest childCount
    const byKey = new Map();
    for (const h of hits) {
        const p = h.payload;
        const key = `${p.parentTag}|${p.childTag}`;
        const prev = byKey.get(key);
        if (!prev || p.childCount > prev.childCount) byKey.set(key, p);
    }
    const entries = [...byKey.values()].sort((a, b) => b.childCount - a.childCount);

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #94e2d5;border-radius:7px;padding:8px 10px;" open>
            <summary style="cursor:pointer;color:#94e2d5;font-weight:700;">
                📦 Virtualization Candidates — ${entries.length} pattern${entries.length !== 1 ? 's' : ''}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${entries.map(p => html`
                    <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div>
                            <code style="color:#cba6f7;">&lt;${p.parentTag}&gt;</code>
                            → <code style="color:#94e2d5;">&lt;${p.childTag}&gt;</code>
                            ×${p.childCount}
                            <span style="color:#6c7086;margin-left:6px;">${Math.round(p.offScreenRatio * 100)}% off-screen</span>
                            <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                        </div>
                        <div style="margin-top:4px;color:#6c7086;">
                            → <code style="color:#a6e3a1;">@lit-labs/virtualizer</code> or <code style="color:#a6e3a1;">&lt;virtual-scroller&gt;</code>
                        </div>
                    </div>
                `)}
            </div>
        </details>
    `;
}
```

Also remove the stub and place this function BEFORE the stub for workers/paint/idle.
In `_renderOpportunitiesTab()`, the `${_renderVirtualizationSection(target)}` call is already in
place (stubs return '' until replaced). No order change needed.

---

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

Add import:
```js
import { VirtualizationAdvisor } from '../../core/virtualization-advisor.js';
```

Add private field:
```js
#virtualizationAdvisor = null;
```

In constructor (after `#domDuplicationAdvisor`):
```js
this.#virtualizationAdvisor = new VirtualizationAdvisor({ store, windowTarget });
```

In `start()`:
```js
this.#virtualizationAdvisor?.start();
```

In `stop()`:
```js
this.#virtualizationAdvisor?.stop();
```

Extend DIAGNOSTIC block in `#onEvidence()`:
```js
if (p?.virtualizationOpportunity) { this.#dispatchPanelUpdate(); return; }
```

Add accessor:
```js
get virtualizationAdvisor() { return this.#virtualizationAdvisor ?? null; }
```

---

### Modify: `src/panel/LdsDebugPanel.js` — `_buildPinpointIssues()`

```js
// Virtualization Candidates
const virtDiags = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.virtualizationOpportunity === true)
    : [];
if (virtDiags.length > 0) {
    const worst = virtDiags.sort((a, b) => b.payload.childCount - a.payload.childCount)[0];
    const p = worst.payload;
    issues.push({
        id: `virt-${p.parentTag}-${p.childTag}`,
        component: p.parentTag || '(list container)',
        filePath: _tagToFilePath(p.parentTag || ''),
        issueType: 'virtualization-opportunity',
        severity: p.strength === 'high' ? 'high' : 'medium',
        details: `<${p.childTag}> rendered ×${p.childCount} inside <${p.parentTag}> — ${Math.round(p.offScreenRatio * 100)}% off-screen.`,
        callStacks: [],
        recommendation: `Wrap the list in a virtual scroller. Use @lit-labs/virtualizer or a native <virtual-list>. This avoids rendering ${Math.round(p.offScreenRatio * p.childCount)} off-screen DOM nodes.`,
        observed: { childCount: p.childCount, offScreenRatio: p.offScreenRatio, parentTag: p.parentTag },
    });
}
```

---

### Modify: `src/index.js`

```js
export { VirtualizationAdvisor } from './core/virtualization-advisor.js';
```

---

## Constraints
- MUST NOT use a timer interval — only `MutationObserver` + debounce
- `#emittedKeys` must be cleared at the START of each `#scanOnce()` (not end)
- `getBoundingClientRect()` is safe here (advisor calling it, not patching prototype)
- All DOM access MUST be wrapped in try/catch for SSR guard
- `parentTag` is the nearest custom-element ancestor (`localName.includes('-')`)

---

## Tests (exact assertions)

File: `test/unit/virtualization-advisor.test.mjs`

Build a fake windowTarget that mocks `querySelectorAll` to return fake elements with fake
`getBoundingClientRect` and a fake `MutationObserver` that calls the callback manually.

1. **< minChildren siblings → no DIAGNOSTIC**
   ```
   Parent with 30 same-tag children all off-screen → no DIAGNOSTIC emitted
   ```

2. **>= minChildren + offScreenRatio >= threshold → emits correct payload**
   ```
   Parent with 60 same-tag children 'x-card', 55 of which are off-screen
   → DIAGNOSTIC with virtualizationOpportunity:true, childTag:'x-card',
     childCount:60, offScreenRatio:~0.92, parentTag:<ancestor tag>
   ```

3. **offScreenRatio < threshold → no DIAGNOSTIC even with many children**
   ```
   100 children, only 40% off-screen → no DIAGNOSTIC
   ```

4. **Custom thresholds respected**
   ```
   new VirtualizationAdvisor({ store, windowTarget, minChildren: 10, offScreenThreshold: 0.5 })
   → 12 children with 55% off-screen → DIAGNOSTIC emitted
   ```

5. **stop() → scan() produces no DIAGNOSTIC after stop**
   ```
   advisor.start(); advisor.stop(); advisor.scan();
   → store has no virtualizationOpportunity DIAGNOSTIC
   ```

---

## Framework extension path
`VirtualizationAdvisor` reads only the DOM — zero framework coupling. Wire in
`ReactIntelligencePipeline` (or `VueIntelligencePipeline`) identically to the Lit pipeline.
No code changes in the advisor itself.

---

## Gate checklist
- [ ] All 100+ existing tests + 12A tests still pass
- [ ] 5 new tests in `virtualization-advisor.test.mjs` pass
- [ ] Virtualization section appears in Opportunities tab when triggered
- [ ] `VirtualizationAdvisor` exported from `src/index.js`
- [ ] Feature doc created: `docs/features/14-virtualization-advisor.md`
