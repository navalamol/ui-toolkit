# Plan: Missions 11A–11D — Four Intelligence Features

## Golden Rule (add to `lit/CLAUDE.md`)

Add this section under the 70/20 Rule:

```markdown
## Quality Rule (non-negotiable)

Five features at 100% quality beats thirty at 70%.
Before shipping any feature ask:
1. Would a developer encountering this for the first time immediately understand what action to take?
2. Does every finding point to a specific function, file, or component — not a vague class?
3. Does the panel section stay accurate as the app runs (no stale data)?

If any answer is No → fix it before declaring the mission done.
```

---

## Implementation order

1. **Mission 11D** — fixes 3 existing stale-panel bugs (no new files, lowest risk)
2. **Mission 11C** — MonitorInBackground (most important per user)
3. **Mission 11A** — Falcor Burst Originator (Falcor tab enhancement)
4. **Mission 11B** — Sequential API Detector (dedicated network sub-section)

---

## Mission 11D — Fix Stale / Replace-Instead-of-Accumulate Panels

### Root causes

| Symptom | Root cause |
|---------|-----------|
| Reactive Cascade never changes | `#onEvidence()` only calls `#analyze()` on ERROR or slow UPDATE_COMPLETED. DEPENDENCY_TRIGGERED events are ignored. |
| Network→State replaces results | `lds-intelligence-updated` is never dispatched when `DIAGNOSTIC(networkCorrelation)` lands, so the panel doesn't re-render. Display also only shows latest 5. |
| Over-rendering same data | Same root cause as above for `DIAGNOSTIC(budgetViolation)`. |

### Fix A — `src/integration/lit/LitIntelligencePipeline.js`

Add `#cascadeDebounce` to private fields (initialize to null).

In `#onEvidence(event)`, add two new branches **before** the existing early-return for frozen state:

```js
// Branch 1: lightweight panel refresh for autonomous DIAGNOSTIC events
if (event.type === RuntimeEventType.DIAGNOSTIC) {
  if (event.payload?.networkCorrelation || event.payload?.budgetViolation) {
    this.#dispatchPanelUpdate();   // does NOT rebuild #latest
    return;
  }
}

// Branch 2: debounced cascade refresh on reactive cascades
if (event.type === RuntimeEventType.DEPENDENCY_TRIGGERED) {
  clearTimeout(this.#cascadeDebounce);
  this.#cascadeDebounce = setTimeout(() => {
    const buf = this.#recorder.snapshot();
    if (buf.length > 0) {
      const synthetic = this.#snapshotRollingIncident(event, 'cascade_refresh');
      this.#analyze(event, synthetic);
    }
  }, 300);
  return;
}
```

Extract the two-line dispatch out of `#publish()` into a private helper:

```js
#dispatchPanelUpdate() {
  this.#windowTarget.__LDS_CASCADE_REPORT__ = this.#latestCascade;
  this.#windowTarget.dispatchEvent(new CustomEvent('lds-intelligence-updated', { bubbles: false }));
}
```

Change `#publish()` to call `this.#dispatchPanelUpdate()` at the end (remove the duplicated lines).

### Fix B — `src/integration/lit/panel-intelligence-presentation.js`

**Network→State section:** replace the `latest 5` slice + raw list with a grouped-by-path display:

```js
function _renderNetworkCorrelationSection(target) {
  const store = target.__LDS_EVIDENCE_STORE__;
  if (!store) return '';
  const all = store.snapshot({ type: 'diagnostic' })
    .filter(d => d.payload?.networkCorrelation);
  if (!all.length) return '';

  // Group by networkPath — accumulate count and keep most-recent tracedMs
  const byPath = new Map();
  for (const d of all) {
    const { networkPath, networkMethod, tracedMs } = d.payload;
    const key = `${networkMethod}:${networkPath}`;
    const prev = byPath.get(key) ?? { count: 0, tracedMs: 0, networkPath, networkMethod };
    byPath.set(key, { ...prev, count: prev.count + 1, tracedMs: Math.max(prev.tracedMs, tracedMs) });
  }

  const rows = [...byPath.values()].sort((a, b) => b.count - a.count).slice(0, 20);
  // ... render rows — "METHOD /path → N state changes (latest: Xms)"
}
```

**Budget violation section:** replace single-pass dedup with a max-across-all accumulation:

```js
const maxByTag = new Map();
for (const d of violations) {
  const { tag, updateCount, windowMs, countPerWindow } = d.payload;
  const prev = maxByTag.get(tag);
  if (!prev || updateCount > prev.updateCount) {
    maxByTag.set(tag, { tag, updateCount, windowMs, countPerWindow });
  }
}
```

### Tests to add in `test/unit/lit-intelligence-pipeline.test.mjs`:
1. Emitting `DEPENDENCY_TRIGGERED` causes cascade to re-run within 400ms (check `cascadeReport()` changes).
2. Emitting `DIAGNOSTIC(networkCorrelation)` dispatches `lds-intelligence-updated` on the window without clearing `#latest`.

---

## Mission 11C — MonitorInBackground

### Enable
```js
window.__LDS_MONITOR_BACKGROUND__ = true
```

Add to `gate.js` — critically: add the check INSIDE `_toolEnabled` AFTER the existing SSR guard (`if (typeof window === 'undefined') return false`), not before it and not as a bare assignment at the top of the function.

```js
if (toolKey === 'monitorBackground' && window.__LDS_MONITOR_BACKGROUND__) return true;
```

Also add to the JSDoc comment block at the top of gate.js:
```
 *   window.__LDS_MONITOR_BACKGROUND__ = true   // persist findings across page navigations
```

### New file: `src/core/background-session-store.js`

Full implementation (the developer implements this exactly):

```js
const BG_KEY = '__LDS_BG_HISTORY__';
const MAX_ENTRIES = 50;

export class BackgroundSessionStore {
  push(entry) {
    try {
      const all = this.load();
      all.push({ ...entry, id: entry.id ?? `bg-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      if (all.length > MAX_ENTRIES) all.splice(0, all.length - MAX_ENTRIES);
      localStorage.setItem(BG_KEY, JSON.stringify(all));
    } catch (_) { /* quota or unavailable */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(BG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
  }

  clear() {
    try { localStorage.removeItem(BG_KEY); } catch (_) {}
  }

  size() { return this.load().length; }
}
```

Entry shape pushed on each `#publish()`:
```js
{
  id: string,                   // auto-generated
  pageUrl: string,              // window.location.href
  timestamp: number,            // Date.now()
  title: string,                // latest.problem ?? 'No finding'
  rootLabel: string,            // latest.rootCause?.rootLabel ?? ''
  strength: string,             // latest.rootCause?.strength ?? ''
  cascadeSummary: {             // null if no cascade
    triggerCount: number,
    componentCount: number,
    depth: number,
    totalUpdateMs: number
  } | null,
  networkCorrelationCount: number,
  budgetViolationCount: number
}
```

### Modify: `src/integration/lit/LitIntelligencePipeline.js`

Add `#backgroundStore = null` to private fields.

In `start()`, after all other initialization:
```js
if (_toolEnabled('monitorBackground')) {
  this.#backgroundStore = new BackgroundSessionStore();
}
```

In `#publish()`, after writing `window.__LDS_CASCADE_REPORT__`:
```js
if (this.#backgroundStore && this.#latest?.problem) {
  const store = this.#store;
  const diags = store.snapshot({ type: 'diagnostic' });
  this.#backgroundStore.push({
    pageUrl: this.#windowTarget.location?.href ?? '',
    timestamp: Date.now(),
    title: this.#latest.problem ?? 'No finding',
    rootLabel: this.#latest.rootCause?.rootLabel ?? '',
    strength: this.#latest.rootCause?.strength ?? '',
    cascadeSummary: this.#latestCascade?.hasCascade ? {
      triggerCount: this.#latestCascade.triggerCount,
      componentCount: this.#latestCascade.componentCount,
      depth: this.#latestCascade.depth,
      totalUpdateMs: this.#latestCascade.totalUpdateMs
    } : null,
    networkCorrelationCount: diags.filter(d => d.payload?.networkCorrelation).length,
    budgetViolationCount: diags.filter(d => d.payload?.budgetViolation).length
  });
}
```

Add public accessor:
```js
backgroundHistory() { return this.#backgroundStore?.load() ?? []; }
```

Add export method:
```js
exportSessionReport() {
  const entries = this.backgroundHistory();
  if (!entries.length) return '<p>No background history recorded.</p>';
  // Build self-contained HTML table
  const rows = entries.map(e => `
    <tr>
      <td>${new Date(e.timestamp).toLocaleTimeString()}</td>
      <td title="${e.pageUrl}">${e.pageUrl.split('/').pop() || '/'}</td>
      <td>${e.title}</td>
      <td>${e.rootLabel} ${e.strength ? `(${e.strength})` : ''}</td>
      <td>${e.cascadeSummary
        ? `${e.cascadeSummary.triggerCount} triggers · depth ${e.cascadeSummary.depth} · ${e.cascadeSummary.totalUpdateMs.toFixed(1)}ms`
        : '—'}</td>
      <td>${e.networkCorrelationCount}</td>
      <td>${e.budgetViolationCount}</td>
    </tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8">
    <title>LDS Session Report — ${new Date().toLocaleString()}</title>
    <style>body{font:14px monospace;padding:20px}table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#f0f0f0}</style>
    </head><body>
    <h2>LDS Session Report — ${new Date().toLocaleString()}</h2>
    <table><thead><tr><th>Time</th><th>Page</th><th>Finding</th><th>Root Cause</th>
    <th>Cascade</th><th>Net Corr.</th><th>Budget Viol.</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
}
```

Expose on `window.__LDS_EXPORT_SESSION_REPORT__ = () => pipeline.exportSessionReport()` inside `start()`.

### Modify: `src/integration/lit/panel-intelligence-presentation.js`

Add `_renderBackgroundHistorySection(target)`:

```js
function _renderBackgroundHistorySection(target) {
  const pipeline = target.__LDS_INTELLIGENCE_PIPELINE__;
  if (!pipeline) return '';
  const history = pipeline.backgroundHistory();
  if (!history.length) return '';

  // Group by pageUrl, newest first
  const byPage = new Map();
  for (const e of [...history].reverse()) {
    const page = e.pageUrl || 'unknown';
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(e);
  }

  const pageSections = [...byPage.entries()].map(([url, entries]) => {
    const rows = entries.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString();
      const cascade = e.cascadeSummary
        ? `cascade: ${e.cascadeSummary.triggerCount} triggers`
        : '';
      const net = e.networkCorrelationCount ? `${e.networkCorrelationCount} net` : '';
      const budget = e.budgetViolationCount ? `${e.budgetViolationCount} budget` : '';
      const tags = [cascade, net, budget].filter(Boolean).join(' · ');
      return `<li style="margin:4px 0"><span style="color:#888">${time}</span>
        <strong>${e.title}</strong>${tags ? ` <small>(${tags})</small>` : ''}</li>`;
    }).join('');
    const short = url.length > 60 ? '…' + url.slice(-57) : url;
    return `<details style="margin:6px 0">
      <summary style="cursor:pointer;font-weight:600">${short} — ${entries.length} incident${entries.length > 1 ? 's' : ''}</summary>
      <ul style="margin:4px 0 0 16px;padding:0;list-style:none">${rows}</ul>
    </details>`;
  }).join('');

  return `<details open style="border-left:3px solid #89b4fa;padding:8px 12px;margin:8px 0;background:#1e1e2e">
    <summary style="cursor:pointer;font-weight:600;color:#89b4fa">
      📼 Background History — ${history.length} incidents across ${byPage.size} page${byPage.size > 1 ? 's' : ''}
    </summary>
    <p style="margin:6px 0;font-size:12px;color:#a6e3a1">MonitorInBackground is active — findings persist across navigation.</p>
    ${pageSections}
    <p style="margin:6px 0;font-size:11px;color:#585b70">
      Export: <code>window.__LDS_EXPORT_SESSION_REPORT__()</code>
    </p>
  </details>`;
}
```

Call it at the bottom of `_renderIntelligenceTab`.

### Tests (`test/unit/background-session-store.test.mjs`, ≥5):
1. `push` + `load` round-trip preserves all fields
2. Evicts oldest when `push` exceeds MAX_ENTRIES (50)
3. `clear()` makes `load()` return `[]`
4. Graceful when localStorage is unavailable (mock throws — no crash, returns `[]`)
5. Multiple `push` calls accumulate in order

Export `BackgroundSessionStore` from `src/index.js`.

---

## Mission 11A — Falcor Burst Originator

### What the developer sees (UX first)

In the Falcor tab, new view mode **"Originator"** shows:

```
▶ loadProductData  [product-view.js:142]  — 7 paths · 340ms
    ├─ /products/["p1"]["name","price"]
    ├─ /products/["p2"]["name","price"]
    └─ /products/["p3"]["name","price"] (+4 more)
```

Developer immediately knows: "the loop is in `loadProductData` at line 142."

### Capture call stacks in `src/core/network.js`

In the fetch interceptor, when a Falcor request is detected (URL contains `/model.json` or body contains `paths`), add to the NETWORK_STARTED payload:

```js
callStack: (typeof window !== 'undefined' && window.__LDS_FALCOR_VIEW__)
  ? new Error().stack
  : undefined
```

This is synchronous at call time — the stack is accurate. Gate it so it only fires when the Falcor tab is enabled (zero overhead otherwise).

### New file: `src/core/falcor-call-graph.js`

```js
import { RuntimeEventType, EvidenceLevel, AttributionQuality } from './evidence-protocol.js';

const BURST_GAP_MS = 200;   // calls within 200ms of each other = same burst

export class FalcorCallGraph {
  #store;
  #unsubscribe = null;
  #pending = [];             // { eventId, startTs, path, stack: string[] }
  #bursts = [];              // finalized BurstGroup[]
  #flushTimer = null;

  constructor({ store }) { this.#store = store; }

  start() {
    this.#unsubscribe = this.#store.subscribe(ev => this.#onEvent(ev));
  }

  stop() {
    this.#unsubscribe?.();
    clearTimeout(this.#flushTimer);
  }

  getBursts() { return [...this.#bursts]; }

  #onEvent(ev) {
    if (ev.type !== RuntimeEventType.NETWORK_COMPLETED) return;
    if (ev.payload?.decoded?.protocol !== 'falcor') return;

    const stack = this.#parseStack(ev.payload?.callStack ?? ev.correlation?.callStack ?? '');
    const entry = {
      eventId: ev.id,
      startTs: ev.payload.startTs ?? ev.timestamp,
      endTs: ev.timestamp,
      path: ev.payload.decoded?.path ?? ev.payload.path ?? '',
      payload: ev.payload.decoded?.model ?? null,
      stack
    };

    const last = this.#pending[this.#pending.length - 1];
    if (last && (entry.startTs - last.endTs) < BURST_GAP_MS) {
      this.#pending.push(entry);
    } else {
      if (this.#pending.length >= 2) this.#finalizeBurst();
      this.#pending = [entry];
    }

    // Flush after 300ms of silence
    clearTimeout(this.#flushTimer);
    this.#flushTimer = setTimeout(() => {
      if (this.#pending.length >= 2) this.#finalizeBurst();
      this.#pending = [];
    }, 300);
  }

  #finalizeBurst() {
    const calls = [...this.#pending];
    const originator = this.#findLCA(calls.map(c => c.stack));
    const burst = {
      id: `burst-${calls[0].startTs}`,
      startTs: calls[0].startTs,
      endTs: calls[calls.length - 1].endTs,
      totalMs: calls[calls.length - 1].endTs - calls[0].startTs,
      paths: calls.map(c => c.path),
      payloads: calls.map(c => c.payload),
      callCount: calls.length,
      originatorFrame: originator.frame,
      originatorFn: originator.fn,
      originatorFile: originator.file,
      originatorLine: originator.line
    };
    this.#bursts.push(burst);
    if (this.#bursts.length > 100) this.#bursts.shift();
  }

  // Parse "at FnName (file.js:line:col)" from raw stack string
  #parseStack(raw) {
    return (raw ?? '').split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('at ') && !s.includes('<anonymous>') && !s.includes('falcor-call-graph'))
      .slice(0, 15);
  }

  // LCA: find deepest frame present in ALL stacks (scan from bottom of each)
  #findLCA(stacks) {
    if (!stacks.length || !stacks[0].length) return { frame: '', fn: 'unknown', file: '', line: '' };
    // Start from bottom (caller side), find first frame present in all stacks
    const reference = [...stacks[0]].reverse();
    for (const frame of reference) {
      if (stacks.every(s => s.includes(frame))) {
        return this.#parseFrame(frame);
      }
    }
    return { frame: '', fn: 'unknown', file: '', line: '' };
  }

  #parseFrame(frame) {
    // "at FnName (path/to/file.js:42:8)" or "at path/to/file.js:42:8"
    const m = frame.match(/at\s+(?:(\S+)\s+\()?([^)]+):(\d+):\d+\)?/);
    if (!m) return { frame, fn: frame, file: '', line: '' };
    return { frame, fn: m[1] ?? m[2].split('/').pop(), file: m[2], line: m[3] };
  }
}
```

### Wire into `LitIntelligencePipeline.js`

```js
// in constructor (gated):
if (_toolEnabled('falcorView')) {
  this.#falcorCallGraph = new FalcorCallGraph({ store: this.#store });
}

// in start():
this.#falcorCallGraph?.start();
this.#windowTarget.__LDS_FALCOR_CALL_GRAPH__ = this.#falcorCallGraph;

// in stop():
this.#falcorCallGraph?.stop();
```

### Modify: `src/panel/LdsDebugPanel.js` — `_renderFalcor()`

Add `'originator'` to the view mode tab strip (alongside existing `'grouped'`, `'dataindex'`, `'search'`):

```js
// In the view mode tab strip, add:
html`<button class="vm-btn ${this._falcorViewMode === 'originator' ? 'active' : ''}"
  @click=${() => { this._falcorViewMode = 'originator'; }}>Originator Tree</button>`
```

Add rendering branch:

```js
if (this._falcorViewMode === 'originator') {
  return this._renderFalcorOriginatorView();
}
```

New method `_renderFalcorOriginatorView()`:

```js
_renderFalcorOriginatorView() {
  const graph = window.__LDS_FALCOR_CALL_GRAPH__;
  if (!graph) return html`<p style="padding:12px;color:#888">Enable __LDS_FALCOR_VIEW__ to capture originator data.</p>`;
  const bursts = graph.getBursts();
  if (!bursts.length) return html`<p style="padding:12px;color:#888">No bursts captured yet. Make Falcor calls to populate.</p>`;

  return html`<div style="padding:8px">
    ${bursts.slice().reverse().map(b => html`
      <details style="margin:6px 0;border-left:3px solid #cba6f7;padding:6px 10px">
        <summary style="cursor:pointer;font-weight:600">
          ${b.originatorFn}
          <span style="color:#888;font-weight:400;font-size:12px"> [${b.originatorFile.split('/').pop()}:${b.originatorLine}]</span>
          <span style="margin-left:8px;color:#a6e3a1">${b.callCount} paths · ${b.totalMs.toFixed(0)}ms</span>
        </summary>
        <ul style="margin:6px 0 0 12px;padding:0;list-style:none">
          ${b.paths.map((p, i) => html`<li style="margin:2px 0;color:#cdd6f4;font-size:12px">
            ${p || '(path unavailable)'}
          </li>`)}
        </ul>
        <p style="font-size:11px;color:#585b70;margin:4px 0 0">
          Full stack: inspect window.__LDS_FALCOR_CALL_GRAPH__.getBursts() in console
        </p>
      </details>`)}
  </div>`;
}
```

### Tests (`test/unit/falcor-call-graph.test.mjs`, ≥5):
1. Two falcor NETWORK_COMPLETED events within 200ms → one BurstGroup with 2 paths
2. Two events gap > 200ms → two separate BurstGroups
3. Three events with shared stack frame → `originatorFn` correctly parsed
4. Three events with NO shared frame → `originatorFn === 'unknown'`
5. `stop()` prevents new bursts from forming (emit event after stop → getBursts() unchanged)

Export `FalcorCallGraph` from `src/index.js`.

---

## Mission 11B — Sequential API Detector

### What the developer sees (UX first)

Dedicated section in the **Falcor tab** (not buried in Intelligence tab) — tab strip already exists:

```
⚡ Promise.all Opportunities

  loadPageData  [page-loader.js:87]
  10 sequential calls → ~1,340ms wasted  (each: ~148ms avg)
  Paths: /products/["p1"][...], /products/["p2"][...], +8 more

  [How to fix: wrap in Promise.all or falcor batch request]
```

Developer sees the function, the file, the savings estimate, and the paths. Actionable.

### Direct vs Indirect detection

**How sequential detection works at runtime** (both direct and indirect):

- **Direct:** `for(i<10) { await this.pqr() }` — call stack of NETWORK_STARTED[i+1] contains the loop body frame AND all calls share it.
- **Indirect:** `for(i<10) { this.pqr() }` → `pqr → jql → DataObjectManager.initiateRequest`. The call stack of each NETWORK_STARTED event contains: `DataObjectManager.initiateRequest → jql → pqr → loopFn`. LCA across all N stacks = `loopFn`. Developer is pointed directly at `loopFn`.

The LCA algorithm handles both cases identically — it doesn't need to know whether the chain is direct or indirect. The common ancestor frame IS the opportunity.

**Sequential vs parallel test:** if `startTs[i+1]` is within 50ms of `startTs[i]` (i.e., all start almost simultaneously), they're already parallel → skip. Sequential = each start is AFTER the previous complete time.

### New file: `src/core/sequential-api-detector.js`

```js
import { RuntimeEventType, EvidenceLevel, AttributionQuality } from './evidence-protocol.js';

const SEQ_GAP_MS = 50;     // max gap between end[i] and start[i+1] to be "sequential"
const PARALLEL_MS = 50;    // if all starts within this window → already parallel, skip
const MIN_CALLS = 3;

export class SequentialApiDetector {
  #store;
  #unsubscribe = null;
  #inFlight = new Map();    // eventId → { startTs, callStack }
  #completed = [];          // { startTs, endTs, path, callStack: string[], durationMs }
  #opportunities = [];
  #flushTimer = null;
  #minCalls;

  constructor({ store, minCalls = MIN_CALLS }) {
    this.#store = store;
    this.#minCalls = minCalls;
  }

  start() {
    this.#unsubscribe = this.#store.subscribe(ev => this.#onEvent(ev));
  }

  stop() {
    this.#unsubscribe?.();
    clearTimeout(this.#flushTimer);
  }

  getOpportunities() { return [...this.#opportunities]; }

  #onEvent(ev) {
    if (ev.type === RuntimeEventType.NETWORK_STARTED) {
      this.#inFlight.set(ev.id, {
        startTs: ev.timestamp,
        callStack: this.#parseStack(ev.payload?.callStack ?? '')
      });
      return;
    }

    if (ev.type === RuntimeEventType.NETWORK_COMPLETED) {
      const started = this.#inFlight.get(ev.id);
      if (!started) return;
      this.#inFlight.delete(ev.id);

      this.#completed.push({
        startTs: started.startTs,
        endTs: ev.timestamp,
        durationMs: ev.timestamp - started.startTs,
        path: ev.payload?.decoded?.path ?? ev.payload?.path ?? ev.payload?.url ?? '',
        callStack: started.callStack
      });

      // Debounce: flush candidates 200ms after last completion
      clearTimeout(this.#flushTimer);
      this.#flushTimer = setTimeout(() => this.#flush(), 200);
    }
  }

  #flush() {
    const calls = [...this.#completed].sort((a, b) => a.startTs - b.startTs);
    this.#completed = [];
    if (calls.length < this.#minCalls) return;

    // Check: are all starts within PARALLEL_MS? If yes → already parallel
    const startSpan = calls[calls.length - 1].startTs - calls[0].startTs;
    if (startSpan < PARALLEL_MS) return;  // already parallel

    // Check: is this sequential? Each startTs[i+1] within SEQ_GAP_MS of endTs[i]
    let isSequential = true;
    for (let i = 1; i < calls.length; i++) {
      const gap = calls[i].startTs - calls[i - 1].endTs;
      if (gap > SEQ_GAP_MS || gap < -10) { isSequential = false; break; }
    }
    if (!isSequential) return;

    // Find common originator
    const originator = this.#findLCA(calls.map(c => c.callStack));
    const totalMs = calls.reduce((s, c) => s + c.durationMs, 0);
    const maxMs = Math.max(...calls.map(c => c.durationMs));
    const savedMs = totalMs - maxMs;

    const opp = {
      id: `seq-${calls[0].startTs}`,
      callerFn: originator.fn,
      callerFile: originator.file,
      callerLine: originator.line,
      callCount: calls.length,
      paths: calls.map(c => c.path),
      totalMs,
      estimatedSavingsMs: savedMs,
      avgDurationMs: totalMs / calls.length,
      timestamp: calls[0].startTs
    };
    this.#opportunities.push(opp);
    if (this.#opportunities.length > 50) this.#opportunities.shift();

    // Emit DIAGNOSTIC so Intelligence tab can react too
    this.#store.emit({
      type: RuntimeEventType.DIAGNOSTIC,
      evidence: { level: EvidenceLevel.CORRELATION, attribution: AttributionQuality.TEMPORAL_INFERENCE, confidence: 0.75 },
      payload: { sequentialApiOpportunity: true, ...opp }
    });
  }

  #parseStack(raw) {
    return (raw ?? '').split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('at ') && !s.includes('sequential-api-detector') && !s.includes('<anonymous>'))
      .slice(0, 15);
  }

  #findLCA(stacks) {
    if (!stacks.length || !stacks[0].length) return { fn: 'unknown', file: '', line: '' };
    const ref = [...stacks[0]].reverse();
    for (const frame of ref) {
      if (stacks.every(s => s.includes(frame))) return this.#parseFrame(frame);
    }
    return { fn: 'unknown', file: '', line: '' };
  }

  #parseFrame(frame) {
    const m = frame.match(/at\s+(?:(\S+)\s+\()?([^)]+):(\d+):\d+\)?/);
    if (!m) return { fn: frame, file: '', line: '' };
    return { fn: m[1] ?? m[2].split('/').pop(), file: m[2], line: m[3] };
  }
}
```

### Wire into `LitIntelligencePipeline.js`

```js
// constructor:
this.#sequentialApiDetector = new SequentialApiDetector({ store: this.#store });

// start():
this.#sequentialApiDetector.start();
this.#windowTarget.__LDS_SEQUENTIAL_API_DETECTOR__ = this.#sequentialApiDetector;

// stop():
this.#sequentialApiDetector.stop();
```

### Modify: `src/panel/LdsDebugPanel.js` — `_renderFalcor()`

Add a **dedicated sub-section** at the bottom of `_renderFalcor()` (visible regardless of view mode):

```js
_renderFalcorSequentialSection() {
  const detector = window.__LDS_SEQUENTIAL_API_DETECTOR__;
  if (!detector) return html``;
  const opps = detector.getOpportunities();
  if (!opps.length) return html``;

  return html`<div style="border-top:1px solid #313244;padding:12px;margin-top:8px">
    <div style="font-weight:700;color:#f9e2af;margin-bottom:8px">
      ⚡ Promise.all Opportunities — ${opps.length} pattern${opps.length > 1 ? 's' : ''} detected
    </div>
    ${opps.slice().reverse().map(o => html`
      <details style="margin:6px 0;border-left:3px solid #f9e2af;padding:6px 10px;background:#1e1e2e">
        <summary style="cursor:pointer;font-weight:600">
          ${o.callerFn}
          <span style="color:#888;font-size:12px"> [${o.callerFile.split('/').pop()}:${o.callerLine}]</span>
          <span style="color:#a6e3a1;margin-left:8px">${o.callCount} sequential calls</span>
          <span style="color:#f38ba8;margin-left:6px">~${Math.round(o.estimatedSavingsMs)}ms wasted</span>
        </summary>
        <div style="font-size:12px;margin:6px 0;color:#cdd6f4">
          Paths (${o.paths.length}): ${o.paths.slice(0, 3).map(p => html`<code style="margin-right:6px">${p}</code>`)}
          ${o.paths.length > 3 ? html`<span style="color:#888">+${o.paths.length - 3} more</span>` : ''}
        </div>
        <div style="font-size:11px;color:#585b70">
          Each call ~${Math.round(o.avgDurationMs)}ms avg · total ${Math.round(o.totalMs)}ms · 
          <strong>Refactor: wrap in Promise.all or a single batch request</strong>
        </div>
      </details>`)}
  </div>`;
}
```

Call `this._renderFalcorSequentialSection()` at the bottom of `_renderFalcor()`, always rendered.

### Tests (`test/unit/sequential-api-detector.test.mjs`, ≥5):
1. 3 truly sequential calls (start[i+1] ≈ end[i]) → 1 opportunity with `callCount: 3`
2. 3 parallel calls (all start within 50ms) → no opportunity emitted
3. 2 calls → no opportunity (below minCalls=3)
4. 4 sequential calls with shared stack frame → `callerFn` is parsed correctly (not 'unknown')
5. `estimatedSavingsMs` equals sum(durations) - max(duration) ± 5ms tolerance
6. `stop()` then emitting events → no new opportunities added

Export `SequentialApiDetector` from `src/index.js`.

---

## Files changed summary

| File | Change |
|------|--------|
| `lit/CLAUDE.md` | Add Quality Rule section |
| `src/core/gate.js` | Add `monitorBackground` flag (after SSR guard, not before) |
| `src/core/background-session-store.js` | **New** — 50-entry localStorage persistence |
| `src/core/falcor-call-graph.js` | **New** — burst detection + LCA originator |
| `src/core/sequential-api-detector.js` | **New** — sequential pattern detection + LCA |
| `src/core/network.js` | Add `callStack: new Error().stack` on falcor fetch (gated) |
| `src/integration/lit/LitIntelligencePipeline.js` | Wire all 3 new analyzers; add `#cascadeDebounce`, `#dispatchPanelUpdate`, background push, exportSessionReport |
| `src/integration/lit/panel-intelligence-presentation.js` | Fix network/budget grouping; add `_renderBackgroundHistorySection` |
| `src/panel/LdsDebugPanel.js` | Add Originator Tree view mode; add `_renderFalcorSequentialSection()` always-visible sub-section |
| `src/index.js` | Export `BackgroundSessionStore`, `FalcorCallGraph`, `SequentialApiDetector` |
| `test/unit/background-session-store.test.mjs` | **New** ≥5 tests |
| `test/unit/falcor-call-graph.test.mjs` | **New** ≥5 tests |
| `test/unit/sequential-api-detector.test.mjs` | **New** ≥6 tests |
| `test/unit/lit-intelligence-pipeline.test.mjs` | +2 tests for 11D fix |

## Verification

```sh
node --test test/unit/*.test.mjs
# Must: all 139 existing pass + all new tests pass = ~160+ total
```

Manual check:
1. Set `__LDS_MONITOR_BACKGROUND__ = true`, navigate 2 pages → Intelligence tab shows "📼 Background History — N incidents"
2. Trigger component re-renders → Reactive Cascade updates within 500ms (no longer frozen)
3. Make repeated falcor calls from a loop → Falcor tab → Originator Tree shows `loopFn` frame
4. `window.__LDS_SEQUENTIAL_API_DETECTOR__.getOpportunities()` returns entries; Falcor tab bottom shows "⚡ Promise.all Opportunities"
5. `window.__LDS_EXPORT_SESSION_REPORT__()` returns valid HTML string
