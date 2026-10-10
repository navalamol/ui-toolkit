# Mission 12E — IdleSchedulingAdvisor

Status: OPEN

## Pain
Background refreshes, analytics trackers, and prefetch panels run on the main thread at full
priority. Developers have no visibility into which component updates are safe to defer to
`requestIdleCallback` or `scheduler.postTask`.

## Prerequisite
Missions 12A–12D complete. Adds one section to `panel-opportunities-presentation.js`.

---

## Existing infrastructure to reuse
- `src/core/update-budget-monitor.js` — exact `store.subscribe()` + `#active` lifecycle pattern
- Evidence store `snapshot({ type: RuntimeEventType.STATE_CHANGED })` as interaction proxy
- `src/core/evidence-protocol.js` — `RuntimeEventType.UPDATE_COMPLETED`, `STATE_CHANGED`

---

## What to build

### New file: `src/core/idle-scheduling-advisor.js`

```js
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class IdleSchedulingAdvisor {
    #store;
    #active = false;
    #unsubscribe = null;
    #minUpdateDurationMs;
    #lookbackWindowMs;
    #periodicCountThreshold;
    #periodicMinIntervalMs;
    #ownerHistory = new Map();    // ownerId → [{ timestamp, durationMs }]
    #HISTORY_CAP = 20;

    constructor({
        store,
        minUpdateDurationMs = 16,       // one frame
        lookbackWindowMs = 500,
        periodicCountThreshold = 5,
        periodicMinIntervalMs = 2000,   // guard: ignore sub-2s update streams (live data)
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('IdleSchedulingAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#minUpdateDurationMs = minUpdateDurationMs;
        this.#lookbackWindowMs = lookbackWindowMs;
        this.#periodicCountThreshold = periodicCountThreshold;
        this.#periodicMinIntervalMs = periodicMinIntervalMs;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;
        this.#unsubscribe = this.#store.subscribe(event => this.#onEvent(event));
        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#unsubscribe) { this.#unsubscribe(); this.#unsubscribe = null; }
        this.#ownerHistory.clear();
        return this;
    }

    #onEvent(event) {
        if (event.type !== RuntimeEventType.UPDATE_COMPLETED) return;
        const durationMs = event.payload?.durationMs;
        if (!Number.isFinite(durationMs) || durationMs < this.#minUpdateDurationMs) return;

        const ownerId = event.owner?.id ?? event.owner ?? null;
        const ownerTag = event.owner?.tag ?? event.payload?.tag ?? ownerId ?? 'unknown';
        const ts = event.timestamp ?? Date.now();

        // Update history
        if (!this.#ownerHistory.has(ownerId)) this.#ownerHistory.set(ownerId, []);
        const history = this.#ownerHistory.get(ownerId);
        history.push({ timestamp: ts, durationMs });
        if (history.length > this.#HISTORY_CAP) history.shift();

        if (this.#hasRecentInteraction(ts)) return;   // user-triggered — skip

        const isPeriodic = this.#isPeriodicPattern(ownerId, ts);
        if (!isPeriodic && durationMs < this.#minUpdateDurationMs * 2) return;  // too weak a signal

        const trigger = isPeriodic ? 'periodic' : 'non-urgent';
        const strength = durationMs >= 100 || isPeriodic ? 'high' : 'medium';

        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: null,
                correlation: { causedByEventId: null },
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.HEURISTIC,
                    confidence: 0.6,
                },
                payload: {
                    idleOpportunity: true,
                    ownerTag,
                    durationMs: Math.round(durationMs),
                    trigger,
                    strength,
                    ...(isPeriodic ? { updateCountInWindow: history.length } : {}),
                },
            });
        } catch (_) {}
    }

    #hasRecentInteraction(beforeTs) {
        // Use STATE_CHANGED as interaction proxy.
        // When RuntimeEventType.INTERACTION is wired in the adapter, swap to that.
        try {
            const recent = this.#store.snapshot({ type: RuntimeEventType.STATE_CHANGED }) ?? [];
            return recent.some(e => {
                const ts = e.timestamp ?? 0;
                return ts >= beforeTs - this.#lookbackWindowMs && ts <= beforeTs;
            });
        } catch (_) {
            return false;
        }
    }

    #isPeriodicPattern(ownerId, currentTs) {
        const history = this.#ownerHistory.get(ownerId) ?? [];
        if (history.length < this.#periodicCountThreshold) return false;

        // All recent entries must have gaps >= periodicMinIntervalMs
        // (guards against streaming data being misclassified as "periodic")
        const recents = history.slice(-this.#periodicCountThreshold);
        for (let i = 1; i < recents.length; i++) {
            const gap = recents[i].timestamp - recents[i - 1].timestamp;
            if (gap < this.#periodicMinIntervalMs) return false;
        }
        return true;
    }
}

export { IdleSchedulingAdvisor };
```

---

### Modify: `src/integration/lit/panel-opportunities-presentation.js`

Replace stub:
```js
function _renderIdleSchedulingSection(_target) { return ''; }
```

With:
```js
function _renderIdleSchedulingSection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const hits = (store.snapshot?.({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.idleOpportunity === true);
    if (hits.length === 0) return '';

    // Deduplicate by ownerTag — keep the one with highest durationMs
    const byTag = new Map();
    for (const h of hits) {
        const p = h.payload;
        const prev = byTag.get(p.ownerTag);
        if (!prev || p.durationMs > prev.durationMs) byTag.set(p.ownerTag, p);
    }
    const entries = [...byTag.values()].sort((a, b) => b.durationMs - a.durationMs);

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #f9e2af;border-radius:7px;padding:8px 10px;" open>
            <summary style="cursor:pointer;color:#f9e2af;font-weight:700;">
                💤 Idle Scheduling Candidates — ${entries.length} non-urgent update${entries.length !== 1 ? 's' : ''}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${entries.map(p => html`
                    <div style="margin-bottom:6px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                        <div>
                            <code style="color:#cba6f7;">&lt;${p.ownerTag}&gt;</code>
                            <span style="color:#f9e2af;margin-left:6px;">${p.durationMs}ms</span>
                            <span style="color:#6c7086;margin-left:6px;">· ${p.trigger === 'periodic' ? `periodic (no gesture)` : 'non-urgent'}</span>
                        </div>
                    </div>
                `)}
                <div style="margin-top:6px;color:#6c7086;line-height:1.5;">
                    → Wrap with <code style="color:#a6e3a1;">requestIdleCallback(fn, {timeout:2000})</code>
                    or <code style="color:#a6e3a1;">scheduler.postTask(fn, {priority:'background'})</code>
                </div>
                <div style="margin-top:4px;color:#45475a;font-size:10px;">
                    Note: interaction proxy uses STATE_CHANGED events — precision improves once
                    INTERACTION events are wired by the framework adapter.
                </div>
            </div>
        </details>
    `;
}
```

---

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

```js
import { IdleSchedulingAdvisor } from '../../core/idle-scheduling-advisor.js';
// field:
#idleAdvisor = null;
// constructor (no windowTarget — store-only):
this.#idleAdvisor = new IdleSchedulingAdvisor({ store });
// start(): this.#idleAdvisor?.start();
// stop(): this.#idleAdvisor?.stop();
// #onEvidence():
if (p?.idleOpportunity) { this.#dispatchPanelUpdate(); return; }
// accessor:
get idleSchedulingAdvisor() { return this.#idleAdvisor ?? null; }
```

### Modify: `src/panel/LdsDebugPanel.js`

```js
const idleDiags = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.idleOpportunity === true)
    : [];
if (idleDiags.length > 0) {
    const worst = idleDiags.sort((a, b) => b.payload.durationMs - a.payload.durationMs)[0];
    const p = worst.payload;
    issues.push({
        id: `idle-${p.ownerTag}`,
        component: p.ownerTag || 'unknown',
        filePath: _tagToFilePath(p.ownerTag || ''),
        issueType: 'idle-scheduling-opportunity',
        severity: 'medium',
        details: `<${p.ownerTag}> runs a ${p.durationMs}ms update with no preceding user interaction (${p.trigger}).`,
        callStacks: [],
        recommendation: `Wrap the update trigger in requestIdleCallback(fn, {timeout:2000}) or scheduler.postTask(fn, {priority:'background'}).`,
        observed: { durationMs: p.durationMs, trigger: p.trigger },
    });
}
```

### Modify: `src/index.js`
```js
export { IdleSchedulingAdvisor } from './core/idle-scheduling-advisor.js';
```

---

## Constraints
- `IdleSchedulingAdvisor` MUST NOT accept `windowTarget` — it is purely store-driven
- `STATE_CHANGED` proxy is intentionally conservative — accept false negatives over false positives
- Streaming data guard: `periodicMinIntervalMs` defaults to 2000ms — updates faster than 2s apart
  are NOT flagged as "periodic"
- `HISTORY_CAP = 20` per owner to bound memory

---

## Tests (5 — all Node-only, no browser APIs)

File: `test/unit/idle-scheduling-advisor.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStore } from '../../src/core/evidence-store.js';
import { LitAdapter }   from '../../src/adapter/lit/LitAdapter.js';
import { IdleSchedulingAdvisor } from '../../src/core/idle-scheduling-advisor.js';
import { RuntimeEventType } from '../../src/core/evidence-protocol.js';

function makeStore() { return new EvidenceStore({ maxEntries: 200 }); }
```

1. **UPDATE_COMPLETED durationMs < 16 → no DIAGNOSTIC**
   ```
   Emit UPDATE_COMPLETED { durationMs: 10, owner: { id: 'x', tag: 'x-thing' }, timestamp: 1000 }
   → no idleOpportunity DIAGNOSTIC
   ```

2. **UPDATE_COMPLETED durationMs >= 16 + prior STATE_CHANGED in window → no DIAGNOSTIC**
   ```
   Emit STATE_CHANGED at T=900
   Emit UPDATE_COMPLETED { durationMs: 50, timestamp: 1000 }
   → lookback window [500, 1000] contains STATE_CHANGED → no DIAGNOSTIC
   ```

3. **UPDATE_COMPLETED durationMs >= 32 + no prior STATE_CHANGED → emits idleOpportunity**
   ```
   Emit UPDATE_COMPLETED { durationMs: 32, owner: { id: 'a', tag: 'x-analytics' }, timestamp: 5000 }
   → DIAGNOSTIC with idleOpportunity:true, ownerTag:'x-analytics', trigger:'non-urgent'
   ```

4. **5 periodic updates (gap >= 2000ms) with no interactions → trigger:'periodic'**
   ```
   Emit 5 UPDATE_COMPLETED events for same owner, each 3000ms apart, no STATE_CHANGED
   → DIAGNOSTIC with trigger:'periodic', updateCountInWindow:5
   ```

5. **stop() → no DIAGNOSTIC after stop**
   ```
   advisor.start(); advisor.stop();
   Emit UPDATE_COMPLETED { durationMs: 100, timestamp: 9000 }
   → no DIAGNOSTIC
   ```

---

## Framework extension path
Subscribes only to `UPDATE_COMPLETED` and reads `STATE_CHANGED` snapshots — both emitted by any
UREP-compliant framework adapter. React and Vue adapters that emit these events get this advisor
free, with one future improvement: swap `STATE_CHANGED` to `INTERACTION` once wired.

---

## Gate checklist
- [ ] All existing + 12A–12D tests pass
- [ ] 5 new tests in `idle-scheduling-advisor.test.mjs` pass
- [ ] "Opportunities" tab shows all 5 sections when applicable
- [ ] "No opportunities detected yet" empty state works correctly
- [ ] `IdleSchedulingAdvisor` exported from `src/index.js`
- [ ] Feature doc: `docs/features/17-idle-scheduling-advisor.md`
- [ ] ROADMAP updated to reflect Missions 12A–12E + new Opportunities tab
