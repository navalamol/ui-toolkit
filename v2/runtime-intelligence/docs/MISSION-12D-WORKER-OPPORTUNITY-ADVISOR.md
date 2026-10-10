# Mission 12D — WorkerOpportunityAdvisor

Status: OPEN

## Pain
Long tasks block the main thread but developers can't tell which ones are expensive
post-fetch processing that could be offloaded to a Web Worker vs. unavoidable layout work.

## Prerequisite
Missions 12A–12C complete. Adds one section to `panel-opportunities-presentation.js`.

---

## Existing infrastructure to reuse
- `src/core/network.js` → `network-evidence-bridge.js` already emits `NETWORK_COMPLETED` events
  to the evidence store with `payload.url` and `payload.responseSize`. Subscribe from there —
  NEVER read `window.__LDS_NETWORK_LOG__` directly.
- `src/core/vitals.js` — existing `PerformanceObserver('longtask')` pattern to reference
- `src/core/update-budget-monitor.js` — store subscription + deduplication lifecycle pattern

---

## What to build

### New file: `src/core/worker-opportunity-advisor.js`

```js
import { EvidenceLevel, AttributionQuality, RuntimeEventType } from './evidence-protocol.js';

class WorkerOpportunityAdvisor {
    #store;
    #windowTarget;
    #active = false;
    #longTaskThresholdMs;
    #networkSizeThresholdBytes;
    #correlationWindowMs;
    #dedupeWindowMs;
    #observer = null;
    #networkUnsub = null;
    #recentLargeNetworkEvents = [];   // [{ url, responseSizeBytes, completedAtMs }] capped at 50
    #emittedUrls = new Map();         // scriptUrl → lastEmitTimestamp (ms)

    constructor({
        store,
        windowTarget = typeof window !== 'undefined' ? window : null,
        longTaskThresholdMs = 80,
        networkSizeThresholdBytes = 102400,   // 100 KB
        correlationWindowMs = 500,
        dedupeWindowMs = 60000,
    } = {}) {
        if (!store || typeof store.emit !== 'function' || typeof store.subscribe !== 'function') {
            throw new TypeError('WorkerOpportunityAdvisor requires an EvidenceStore-compatible store.');
        }
        this.#store = store;
        this.#windowTarget = windowTarget;
        this.#longTaskThresholdMs = longTaskThresholdMs;
        this.#networkSizeThresholdBytes = networkSizeThresholdBytes;
        this.#correlationWindowMs = correlationWindowMs;
        this.#dedupeWindowMs = dedupeWindowMs;
    }

    start() {
        if (this.#active) return this;
        this.#active = true;

        // Subscribe to network events from the evidence store
        this.#networkUnsub = this.#store.subscribe(event => {
            if (event.type !== RuntimeEventType.NETWORK_COMPLETED) return;
            const sizeBytes = event.payload?.responseSize ?? 0;
            if (sizeBytes < this.#networkSizeThresholdBytes) return;
            if (this.#recentLargeNetworkEvents.length >= 50) this.#recentLargeNetworkEvents.shift();
            this.#recentLargeNetworkEvents.push({
                url: event.payload?.url ?? '',
                responseSizeBytes: sizeBytes,
                completedAtMs: this.#now(),
            });
        });

        // Watch for long tasks
        const win = this.#windowTarget;
        if (win?.PerformanceObserver) {
            try {
                this.#observer = new win.PerformanceObserver(list => this.#onLongTaskEntries(list));
                this.#observer.observe({ entryTypes: ['longtask'] });
            } catch (_) {}
        }

        return this;
    }

    stop() {
        if (!this.#active) return this;
        this.#active = false;
        if (this.#observer) { this.#observer.disconnect(); this.#observer = null; }
        if (this.#networkUnsub) { this.#networkUnsub(); this.#networkUnsub = null; }
        this.#recentLargeNetworkEvents.length = 0;
        this.#emittedUrls.clear();
        return this;
    }

    #now() {
        const win = this.#windowTarget;
        return win?.performance?.timeOrigin != null
            ? win.performance.timeOrigin + (win.performance.now?.() ?? 0)
            : Date.now();
    }

    #onLongTaskEntries(list) {
        for (const entry of list.getEntries()) {
            if (entry.duration >= this.#longTaskThresholdMs) this.#processLongTask(entry);
        }
    }

    #processLongTask(entry) {
        // Convert PerformanceEntry startTime (relative to timeOrigin) to absolute ms
        const win = this.#windowTarget;
        const taskStartMs = (win?.performance?.timeOrigin ?? 0) + entry.startTime;

        const attribution = entry.attribution?.[0];
        const scriptUrl = attribution?.containerSrc || '';
        const isThirdParty = scriptUrl
            ? !scriptUrl.startsWith(win?.location?.origin ?? '___NO_MATCH___')
            : false;

        const networkTrigger = this.#findNetworkTrigger(taskStartMs);
        const trigger = networkTrigger ? 'large-network-response' : 'longtask-only';
        const now = Date.now();

        if (this.#shouldDedup(scriptUrl, now)) return;
        this.#emittedUrls.set(scriptUrl, now);

        try {
            this.#store.emit({
                type: RuntimeEventType.DIAGNOSTIC,
                owner: null,
                correlation: { causedByEventId: null },
                evidence: {
                    level: EvidenceLevel.CORRELATION,
                    attribution: AttributionQuality.TEMPORAL_INFERENCE,
                    confidence: networkTrigger ? 0.6 : 0.4,
                },
                payload: {
                    workerOpportunity: true,
                    durationMs: Math.round(entry.duration),
                    scriptUrl,
                    isThirdParty,
                    trigger,
                    ...(networkTrigger ? {
                        networkResponseKB: Math.round(networkTrigger.responseSizeBytes / 1024),
                        networkUrl: networkTrigger.url,
                    } : {}),
                    strength: entry.duration >= 150 ? 'high' : 'medium',
                },
            });
        } catch (_) {}
    }

    #findNetworkTrigger(taskStartMs) {
        for (const evt of [...this.#recentLargeNetworkEvents].reverse()) {
            const gap = taskStartMs - evt.completedAtMs;
            if (gap >= 0 && gap <= this.#correlationWindowMs) return evt;
        }
        return null;
    }

    #shouldDedup(scriptUrl, now) {
        const last = this.#emittedUrls.get(scriptUrl);
        return last != null && now - last < this.#dedupeWindowMs;
    }
}

export { WorkerOpportunityAdvisor };
```

---

### Modify: `src/integration/lit/panel-opportunities-presentation.js`

Replace stub:
```js
function _renderWorkerOpportunitySection(_target) { return ''; }
```

With:
```js
function _renderWorkerOpportunitySection(target) {
    const store = target?.__LDS_EVIDENCE_STORE__;
    if (!store) return '';
    const hits = (store.snapshot?.({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.workerOpportunity === true);
    if (hits.length === 0) return '';

    // Deduplicate by scriptUrl — keep longest durationMs
    const byUrl = new Map();
    for (const h of hits) {
        const p = h.payload;
        const key = p.scriptUrl || '(anonymous)';
        const prev = byUrl.get(key);
        if (!prev || p.durationMs > prev.durationMs) byUrl.set(key, p);
    }
    const entries = [...byUrl.values()].sort((a, b) => b.durationMs - a.durationMs);

    return html`
        <details style="margin-top:10px;border:1px solid #313244;border-left:3px solid #cba6f7;border-radius:7px;padding:8px 10px;" open>
            <summary style="cursor:pointer;color:#cba6f7;font-weight:700;">
                ⚙️ Worker Offload Candidates — ${entries.length} long task${entries.length !== 1 ? 's' : ''}
            </summary>
            <div style="margin-top:8px;font-size:11px;color:#bac2de;line-height:1.6;">
                ${entries.map(p => {
                    const urlDisplay = p.scriptUrl
                        ? p.scriptUrl.split('/').slice(-2).join('/').slice(0, 60)
                        : '(anonymous script)';
                    return html`
                        <div style="margin-bottom:8px;padding:6px 8px;background:#1e1e2e;border-radius:5px;">
                            <div>
                                <code style="color:#cba6f7;">${urlDisplay}</code>
                                <span style="color:#f38ba8;margin-left:6px;">${p.durationMs}ms</span>
                                ${p.isThirdParty ? html`<span style="color:#585b70;margin-left:6px;">(3rd party)</span>` : ''}
                                <span style="float:right;color:${p.strength === 'high' ? '#f38ba8' : '#f9e2af'};font-size:10px;">${p.strength}</span>
                            </div>
                            ${p.trigger === 'large-network-response' ? html`
                                <div style="color:#89b4fa;font-size:10px;margin-top:2px;">
                                    Correlated with ${p.networkResponseKB}KB response
                                </div>
                            ` : ''}
                            <div style="margin-top:3px;color:#6c7086;">
                                → <code style="color:#a6e3a1;">new Worker(url)</code> + <code style="color:#a6e3a1;">postMessage</code> to free the main thread
                            </div>
                        </div>
                    `;
                })}
            </div>
        </details>
    `;
}
```

---

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

```js
import { WorkerOpportunityAdvisor } from '../../core/worker-opportunity-advisor.js';
// field:
#workerAdvisor = null;
// constructor:
this.#workerAdvisor = new WorkerOpportunityAdvisor({ store, windowTarget });
// start(): this.#workerAdvisor?.start();
// stop(): this.#workerAdvisor?.stop();
// #onEvidence():
if (p?.workerOpportunity) { this.#dispatchPanelUpdate(); return; }
// accessor:
get workerOpportunityAdvisor() { return this.#workerAdvisor ?? null; }
```

### Modify: `src/panel/LdsDebugPanel.js`

```js
const workerDiags = (typeof window !== 'undefined' && window.__LDS_EVIDENCE_STORE__)
    ? (window.__LDS_EVIDENCE_STORE__.snapshot({ type: 'diagnostic' }) ?? [])
        .filter(e => e.payload?.workerOpportunity === true)
    : [];
if (workerDiags.length > 0) {
    const worst = workerDiags.sort((a, b) => b.payload.durationMs - a.payload.durationMs)[0];
    const p = worst.payload;
    const urlShort = p.scriptUrl?.split('/')?.slice(-2)?.join('/') ?? '(anonymous)';
    issues.push({
        id: `worker-${urlShort}`,
        component: '(main thread)',
        filePath: p.scriptUrl || '',
        issueType: 'worker-opportunity',
        severity: 'medium',
        details: `Main thread blocked for ${p.durationMs}ms by ${urlShort}${p.trigger === 'large-network-response' ? ` after ${p.networkResponseKB}KB network response` : ''}.`,
        callStacks: [],
        recommendation: `Move the processing in ${urlShort} to a Web Worker: new Worker(url) + postMessage for data transfer.`,
        observed: { durationMs: p.durationMs, trigger: p.trigger, scriptUrl: p.scriptUrl },
    });
}
```

### Modify: `src/index.js`
```js
export { WorkerOpportunityAdvisor } from './core/worker-opportunity-advisor.js';
```

---

## Constraints
- MUST subscribe to `RuntimeEventType.NETWORK_COMPLETED` from store — NOT `window.__LDS_NETWORK_LOG__`
- `PerformanceLongTaskTiming.attribution` is Chromium-only — MUST handle empty arrays gracefully
- Deduplication: same `scriptUrl` emits at most once per `dedupeWindowMs` (default 60s)
- `causedByEventId` MUST be null — this is temporal correlation, not confirmed causality

---

## Tests

File: `test/unit/worker-opportunity-advisor.test.mjs`

Helper: a fake `PerformanceObserver` that stores the callback and can be triggered manually.

1. **Long task < threshold → no DIAGNOSTIC**
   ```
   Fake longtask entry with duration 50ms (threshold 80)
   → no DIAGNOSTIC
   ```

2. **Long task >= threshold → emits workerOpportunity:true**
   ```
   Fake longtask entry, duration 120ms, no network trigger
   → DIAGNOSTIC with workerOpportunity:true, durationMs:120, trigger:'longtask-only'
   ```

3. **Long task + matching NETWORK_COMPLETED in store → 'large-network-response' trigger**
   ```
   Emit NETWORK_COMPLETED { url:'api/data', responseSize:200000 } at T=0
   Fire longtask entry startTime=200ms (taskStartMs ≈ T+200)
   → trigger:'large-network-response', networkResponseKB:195
   ```

4. **Same scriptUrl within dedupeWindowMs → only one DIAGNOSTIC**
   ```
   Two longtask entries, same containerSrc, 5 seconds apart (dedupeWindowMs default 60000)
   → exactly 1 DIAGNOSTIC emitted
   ```

5. **stop() → no DIAGNOSTIC after stop**
   ```
   advisor.start(); advisor.stop();
   fire longtask entry manually
   → no DIAGNOSTIC
   ```

---

## Framework extension path
Subscribes to `NETWORK_COMPLETED` from the evidence store — any framework adapter that emits
those events (React adapter already does via `network-evidence-bridge.js`) gets this advisor free.

---

## Gate checklist
- [ ] All existing + 12A–12C tests pass
- [ ] 5 new tests in `worker-opportunity-advisor.test.mjs` pass
- [ ] Correct `NETWORK_COMPLETED` store subscription (not window global)
- [ ] `WorkerOpportunityAdvisor` exported from `src/index.js`
- [ ] Feature doc: `docs/features/16-worker-opportunity-advisor.md`
