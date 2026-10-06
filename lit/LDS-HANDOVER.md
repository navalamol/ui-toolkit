# lit-debug-suite — Session Handover

**Date:** 2026-10-06  
**Status:** Phase 7 complete — Evidence Quality Upgrade implemented  
**What remains:** npm install + build + place icon PNGs + browser-test (see §1, §5); Phase 8 next

---

## What was built

A fully generic, publishable npm package `lit-debug-suite` extracted from the Syndigo `ruf-debug-panel` (12-tool RUF Debug Suite in `ui-platform-elements/src/base/`).

**Key design decisions:**
- All namespace globals renamed `__RUF_*` → `__LDS_*`
- All Lit lifecycle hooks in `src/adapter/lit/` — NOT in generic core
- Adapter interface generic in `src/adapter/FrameworkAdapter.js`  
- Core logic (data structures, algorithms, window globals) in `src/core/` — zero framework deps
- ALL Syndigo-specific code ONLY in `custom/ui-platform/`
- Falcor decoder is its own file: `custom/ui-platform/FalcorDecoder.js`
- REST/default decoder is a pluggable hook: `LdsNetwork.registerDecoder(fn)`
- Chrome extension as UI delivery layer (Manifest V3)

---

## Complete file list (all written)

### Core tools (`src/core/`)
| File | Description |
|------|-------------|
| `gate.js` | Master enable/disable logic, `_toolEnabled(key)` |
| `memory.js` | Mount/unmount/GC tracking via FinalizationRegistry |
| `perf.js` | TTI tracker, slow render incidents (Lit-only, no Polymer) |
| `error-boundary.js` | Wraps `performUpdate`, auto-POST to `__LDS_CRASH_ENDPOINT__` |
| `prop-audit.js` | Render reasons (R2-A), property thrash (R2-B) |
| `inspector.js` | Hover badge overlay, prop snapshot, `window.__LDS_CONTEXT_GETTER__` hook |
| `cycle-detector.js` | Directed graph DFS circular update chain detection |
| `event-tracer.js` | `patchDispatch(installFn)` + `recordEvent()` + frequency table |
| `slow-api.js` | `wrapObject(obj, methods)` for API monitoring |
| `console.js` | console.error/warn ring buffer |
| `vitals.js` | LCP, CLS, INP, Long Tasks via PerformanceObserver |
| `network.js` | fetch+XHR patch, `registerDecoder(fn)` plugin hook |

### Adapter layer
| File | Description |
|------|-------------|
| `src/adapter/FrameworkAdapter.js` | Abstract base, 6 methods |
| `src/adapter/lit/LitAdapter.js` | Lit 3 concrete impl (performUpdate, requestUpdate, updated, updateComplete) |

### Main mixin
| File | Description |
|------|-------------|
| `src/LitDebugMixin.js` | Drop-in mixin, connectedCallback/disconnectedCallback |
| `src/index.js` | Barrel export of everything |

### Panel
| File | Description |
|------|-------------|
| `src/panel/LdsDebugPanel.js` | Full 12-tab debug panel (~1400 lines), `<lds-debug-panel>` |

**Panel tabs:** Summary · Pinpoint · Vitals · Network · Perf · Errors · Console · Events · SlowAPI · Memory · History · Env

**Key differences from ruf-debug-panel:**
- ACI tab → Events tab (key: `events`)
- `r.aciTimeline` → `r.eventsTimeline`, `r.aciFreq` → `r.eventsFreq`
- `entry.falcor` → `entry.decoded`
- `_tagToFilePath` uses `window.__LDS_TAG_TO_FILE__` hook
- No Syndigo platform context fields
- History, diff, HTML export, fix table export — all preserved

### Syndigo custom plugins (`custom/ui-platform/`)
| File | Description |
|------|-------------|
| `FalcorDecoder.js` | `decodeFalcor(rawUrl, body)` — extracted verbatim from ruf-network.js |
| `AciPlugin.js` | `attachToElement(el)` + `installGlobalAciPatch(globalAci)` |
| `SyndigoSlowApiPlugin.js` | `install()` — finds/retries `window.__dataObjectManager__`, calls `LdsSlowApiMonitor.wrapObject()` |
| `compat.js` | `__RUF_*` → `__LDS_*` live getter aliases |
| `index.js` | Registers all three plugins on import |

### Chrome Extension (`extension/`)
| File | Description |
|------|-------------|
| `manifest.json` | MV3, permissions: activeTab + scripting + storage |
| `background.js` | Service worker, icon click toggles `__LDS_DEBUG__` per tab |
| `content.js` | Mounts `<lds-debug-panel>` when debug is enabled |
| `panel-host.js` | Injects `panel.bundle.js` and fires `__lds-panel-ready__` |

### Package
| File | Description |
|------|-------------|
| `package.json` | name: `lit-debug-suite`, exports: `.`, `./panel`, `./custom/ui-platform` |
| `README.md` | Full usage docs |

---

## What still needs to be done

### 1. Install devDependencies and run the build
```bash
cd lit/
npm install
npm run build           # builds lib/ and extension/panel.bundle.js
# or separately:
npm run build:lib       # ESM library output → lib/
npm run build:extension # dev extension bundle → extension/panel.bundle.js
```

Then add placeholder icon PNGs (any 16×16, 48×48, 128×128 PNG files):
```
extension/icons/icon16.png
extension/icons/icon48.png
extension/icons/icon128.png
```
Chrome rejects unpacked extensions without them.

`rollup.extension.config.js` and `rollup.lib.config.js` are both present.

### Extension bug fixed (2026-09-18)
Original `panel-host.js` approach caused `Cannot read properties of null (reading 'get')`
because it ran in Chrome's isolated world where `customElements` is a separate registry
from the page. Fix: `background.js` now injects `panel.bundle.js` directly via
`executeScript({ world: 'MAIN' })`. `panel-host.js` is now a dev-only reference file,
not used by the extension. See `ARCHITECTURE.md §5` for full explanation.

### 2. Wire into Syndigo `ruf-element.js` (optional — for Syndigo app)
In `src/base/ruf-element.js`, replace the 12 individual `ruf-*.js` imports with:
```js
import { LitDebugMixin } from 'lit-debug-suite';
import 'lit-debug-suite/custom/ui-platform';
// Then: class RufElement extends LitDebugMixin(LitElement) { ... }
```

### 3. Wire ACI per-element (for Syndigo app)
In `ruf-element.js` connectedCallback:
```js
import { attachToElement } from 'lit-debug-suite/custom/ui-platform';
connectedCallback() {
  super.connectedCallback();
  if (this.aci) attachToElement(this);
}
```

### 4. Add `rollup.config.js` or `vite.config.js`
The package needs a build config for the `lib/` output if consuming apps import from `lit-debug-suite/lib/`.
Currently exports point at `src/` directly which requires the consumer to have Lit in their dependencies.

### 5. Test the panel in a browser
A dev-harness page is ready at `test/panel-test.html`. Serve the repo root and open it:
```bash
cd lit/
npm run serve   # starts npx serve on port 8080
# open: http://localhost:8080/test/panel-test.html
```
Click "Enable LDS Debug" to mount `<lds-debug-panel>` and verify each tab renders. The harness seeds fake perf/network/error/event data so all tabs have something to show without a real app.

### 6. Update memory file
After session completion, update `C:\Users\AmolSurendraNaval\.claude\projects\D--Work-R7-generic-changes-ui-platform-elements\memory\project-ruf-debug-suite.md` to reflect that the `lit-debug-suite` package is now complete.

---

## Key technical notes for next session

### `LdsEventTracer.patchDispatch` pattern
The `attach(el)` method is a NO-OP. Event tracing only works if:
1. You call `LdsEventTracer.patchDispatch(installFn)` — for global event buses
2. OR you call `LdsEventTracer.recordEvent(name, detail, tag)` directly
3. OR you use `AciPlugin.attachToElement(el)` — which wraps `el.aci.dispatch`

### Network decoded field
Network log entries have `entry.decoded` (not `entry.falcor`). The panel reads `entry.decoded` correctly. The decoded object shape from FalcorDecoder:
```js
{ protocol: 'falcor', method, callPath, callPathArr, types, args, domain, appName, operation }
```

### Inspector context
In the generic panel, component snapshots have no Syndigo context fields. To add them, set:
```js
window.__LDS_CONTEXT_GETTER__ = (el) => ({
  tenantId: el.tenantId,
  userId:   el.userId,
  roles:    el.roles,
  // etc.
});
```

### File path resolver
```js
window.__LDS_TAG_TO_FILE__ = (tag) => `src/elements/${tag}/${tag}.js`;
```
Without this, paths default to `src/components/${tag}/${tag}.js`.

---

---

## Wiring lit-debug-suite into ui-platform-elements (full guide)

This section covers the exact changes needed to replace the embedded `ruf-*.js` tools in
`ui-platform-elements/src/base/` with imports from `lit-debug-suite`.

---

### Step 0 — Add the dependency

In `ui-platform-elements/package.json`, add a local path dep (until published to npm):
```json
"dependencies": {
  "lit-debug-suite": "file:../../perf-tool/lit"
}
```
Then `npm install`.

---

### Step 1 — ruf-element.js (the core change)

The old file imports each tool individually and has its own `_getDebugFlag` / `_toolEnabled` logic.
Replace the entire debug-tool block with `LitDebugMixin` composition.

**Lines to REMOVE from the top of ruf-element.js:**
```js
// DELETE these imports:
import * as RufPerf          from './ruf-perf.js';
import * as RufPropAudit     from './ruf-prop-audit.js';
import * as RufErrorBoundary from './ruf-error-boundary.js';
import * as RufCycleDetector from './ruf-cycle-detector.js';
import * as RufMemory        from './ruf-memory.js';
import * as RufNetwork       from './ruf-network.js';
import * as RufVitals        from './ruf-vitals.js';
import * as RufConsole       from './ruf-console.js';
import * as RufInspector     from './ruf-inspector.js';
import * as RufAciTracer     from './ruf-aci-tracer.js';
import * as RufSlowApi       from './ruf-slow-api.js';
```

**Lines to ADD at the top:**
```js
import { LitDebugMixin } from 'lit-debug-suite';
import 'lit-debug-suite/custom/ui-platform'; // Falcor + DataObjectManager + ACI + compat aliases
```

**Class definition change** — compose the mixin into the chain:

Old:
```js
let RufElement = (superclass) => class extends superclass {
```

New:
```js
let RufElement = (superclass) => class extends LitDebugMixin(superclass) {
```

That single change wires all 12 tools. `LitDebugMixin.connectedCallback` runs before
`RufElement`'s own `connectedCallback` body (via `super.connectedCallback()`), which is correct.

**Remove `_getDebugFlag()` and `_toolEnabled()` methods** — they are now in `lit-debug-suite`'s
`src/core/gate.js`. Delete these two methods entirely from `ruf-element.js`.

**Remove the individual attach/detach calls** — in `connectedCallback` and
`disconnectedCallback`, delete all lines like:
```js
// DELETE all of these:
if (this._toolEnabled('perf'))          RufPerf.attach(this);
if (this._toolEnabled('propAudit'))     RufPropAudit.attach(this);
if (this._toolEnabled('errorBoundary')) RufErrorBoundary.attach(this);
// ... and all similar attach() calls

// DELETE in disconnectedCallback:
RufPerf.detach(this);
RufPropAudit.detach(this);
// ... and all similar detach() calls
```

**Bridge the globalSettings flag** — the old code read `mainApp.globalSettings.rufDebugEnabled`
to activate debug. The new `gate.js` reads `window.__LDS_DEBUG__` or
`window.__LDS_APP_CONFIG__?.debugEnabled`. Add this bridge at the top of `connectedCallback`,
before `super.connectedCallback()`:

```js
connectedCallback() {
  // Bridge Syndigo tenant config → generic flag (run once per page load)
  if (!window.__LDS_DEBUG__ && !window.__LDS_BRIDGE_DONE__) {
    window.__LDS_BRIDGE_DONE__ = true;
    const mainApp = OSElements.mainApp;
    if (mainApp?.globalSettings?.rufDebugEnabled) {
      window.__LDS_DEBUG__ = mainApp.globalSettings.rufDebugEnabled;
    }
  }
  super.connectedCallback(); // LitDebugMixin runs here
  // ... rest of existing RufElement connectedCallback unchanged
}
```

**Set the file-path and context hooks** — still in `connectedCallback`, after the bridge:
```js
// Tell the panel how to map tag names to source file paths (Syndigo convention)
if (!window.__LDS_TAG_TO_FILE__) {
  window.__LDS_TAG_TO_FILE__ = (tag) => `src/elements/${tag}/${tag}.js`;
}
// Tell the inspector which properties to show in context snapshot
if (!window.__LDS_CONTEXT_GETTER__) {
  window.__LDS_CONTEXT_GETTER__ = (el) => ({
    tenantId:      el.tenantId,
    userId:        el.userId,
    roles:         el.roles,
    defaultRole:   el.defaultRole,
    appId:         el.appId,
    contextData:   el.contextData,
    ownershipData: el.ownershipData,
  });
}
```

---

### Step 2 — app-base.js (crash endpoint + ACI global patch)

If the app uses `rufCrashEndpoint` (auto-POST on crash), set the generic equivalent:
```js
// In app-base.js or main-app.js, after globalSettings is available:
if (this.globalSettings?.rufCrashEndpoint) {
  window.__LDS_CRASH_ENDPOINT__  = this.globalSettings.rufCrashEndpoint;
  window.__LDS_CRASH_AUTO_POST__ = this.globalSettings.rufCrashAutoPost ?? false;
}
```

For global ACI patching (captures dispatches from elements that don't go through `el.aci`):
```js
// If you have a global aci instance available in app context:
import { installGlobalAciPatch } from 'lit-debug-suite/custom/ui-platform';
// call once after aci is initialised:
installGlobalAciPatch(window.__aci__ ?? aci);
```

---

### Step 3 — app-main.js / app-main-v2.js (the debug panel)

The panel tag changes from `<ruf-debug-panel>` to `<lds-debug-panel>`.

**app-main.js (Polymer):**
```html
<!-- Old: -->
<ruf-debug-panel hidden$="[[!globalSettings.rufDebugEnabled]]"></ruf-debug-panel>

<!-- New: (import once at top of file, then) -->
<lds-debug-panel hidden$="[[!globalSettings.rufDebugEnabled]]"></lds-debug-panel>
```
Add to JS imports:
```js
import 'lit-debug-suite/panel'; // registers <lds-debug-panel>
```

**app-main-v2.js (Lit):**
```js
import 'lit-debug-suite/panel';

// In render():
// Old: ${this.globalSettings?.rufDebugEnabled ? html`<ruf-debug-panel></ruf-debug-panel>` : ''}
// New:
${this.globalSettings?.rufDebugEnabled ? html`<lds-debug-panel></lds-debug-panel>` : ''}
```

---

### Step 4 — What to do with the old ruf-*.js files

After the above changes are wired and tested, the following files in `src/base/` are **redundant**
and can be deleted:

| Old file | Replaced by |
|----------|-------------|
| `ruf-perf.js` | `lit-debug-suite/src/core/perf.js` |
| `ruf-prop-audit.js` | `lit-debug-suite/src/core/prop-audit.js` |
| `ruf-error-boundary.js` | `lit-debug-suite/src/core/error-boundary.js` |
| `ruf-cycle-detector.js` | `lit-debug-suite/src/core/cycle-detector.js` |
| `ruf-memory.js` | `lit-debug-suite/src/core/memory.js` |
| `ruf-vitals.js` | `lit-debug-suite/src/core/vitals.js` |
| `ruf-console.js` | `lit-debug-suite/src/core/console.js` |
| `ruf-network.js` | `lit-debug-suite/src/core/network.js` + `custom/ui-platform/FalcorDecoder.js` |
| `ruf-aci-tracer.js` | `lit-debug-suite/custom/ui-platform/AciPlugin.js` |
| `ruf-slow-api.js` | `lit-debug-suite/custom/ui-platform/SyndigoSlowApiPlugin.js` |
| `ruf-inspector.js` | `lit-debug-suite/src/core/inspector.js` |
| `ruf-debug-panel.js` | `lit-debug-suite/src/panel/LdsDebugPanel.js` |

**Keep** `ruf-element.js` — it is the Syndigo base element and has logic beyond just debug tools.

**Compat layer** — `custom/ui-platform/index.js` already imports `compat.js` which aliases all
`__LDS_*` globals back to `__RUF_*` names. So any existing support tooling, saved reports, or
bookmarked console commands that reference `window.__RUF_PERF__` etc. will still work during the
transition period.

---

### Step 5 — Test the integration

1. `window.__LDS_DEBUG__ = true` in the browser console
2. The `<lds-debug-panel>` badge (🐞) should appear in the page corner
3. Click it → panel opens with all 12 tabs
4. **Verify Falcor** — open the Network tab, make any API call → `decoded` column shows protocol/domain/operation
5. **Verify ACI** — open the Events tab, trigger any ACI action → appears in timeline
6. **Verify file paths** — open Pinpoint → issue cards show `src/elements/<tag>/<tag>.js:line`
7. **Verify compat** — in console: `window.__RUF_PERF__` should return same object as `window.__LDS_PERF__`

---

### Summary of changes to ruf-element.js (diff shape)

```diff
 // ruf-element.js
-import * as RufPerf          from './ruf-perf.js';
-import * as RufPropAudit     from './ruf-prop-audit.js';
-import * as RufErrorBoundary from './ruf-error-boundary.js';
-import * as RufCycleDetector from './ruf-cycle-detector.js';
-import * as RufMemory        from './ruf-memory.js';
-import * as RufNetwork       from './ruf-network.js';
-import * as RufVitals        from './ruf-vitals.js';
-import * as RufConsole       from './ruf-console.js';
-import * as RufInspector     from './ruf-inspector.js';
-import * as RufAciTracer     from './ruf-aci-tracer.js';
-import * as RufSlowApi       from './ruf-slow-api.js';
+import { LitDebugMixin } from 'lit-debug-suite';
+import 'lit-debug-suite/custom/ui-platform';

-let RufElement = (superclass) => class extends superclass {
+let RufElement = (superclass) => class extends LitDebugMixin(superclass) {

   connectedCallback() {
+    // Bridge tenant config → generic LDS flag (once per page)
+    if (!window.__LDS_DEBUG__ && !window.__LDS_BRIDGE_DONE__) {
+      window.__LDS_BRIDGE_DONE__ = true;
+      if (OSElements.mainApp?.globalSettings?.rufDebugEnabled) {
+        window.__LDS_DEBUG__ = OSElements.mainApp.globalSettings.rufDebugEnabled;
+      }
+    }
+    // Set Syndigo-specific hooks for panel (once per page)
+    window.__LDS_TAG_TO_FILE__     ??= (tag) => `src/elements/${tag}/${tag}.js`;
+    window.__LDS_CONTEXT_GETTER__  ??= (el)  => ({ tenantId: el.tenantId, userId: el.userId, roles: el.roles, defaultRole: el.defaultRole, appId: el.appId, contextData: el.contextData, ownershipData: el.ownershipData });
     super.connectedCallback();
-    if (this._toolEnabled('perf'))          RufPerf.attach(this);
-    if (this._toolEnabled('propAudit'))     RufPropAudit.attach(this);
-    if (this._toolEnabled('errorBoundary')) RufErrorBoundary.attach(this);
-    if (this._toolEnabled('cycleDetector')) RufCycleDetector.attach(this);
-    if (this._toolEnabled('memory'))        RufMemory.attach(this);
-    if (this._toolEnabled('network'))       RufNetwork.init();
-    if (this._toolEnabled('vitals'))        RufVitals.init();
-    if (this._toolEnabled('console'))       RufConsole.init();
-    if (this._toolEnabled('inspector'))     RufInspector.attach(this);
     // ... rest unchanged
   }

   disconnectedCallback() {
     super.disconnectedCallback();
-    RufPerf.detach(this);
-    RufPropAudit.detach(this);
-    RufErrorBoundary.detach(this);
-    RufCycleDetector.detach(this);
-    RufMemory.detach(this);
-    RufInspector.detach(this);
     // ... rest unchanged
   }

-  _getDebugFlag() { ... }    // DELETE
-  _toolEnabled(key) { ... }  // DELETE
```

---

## Session 2026-10-06 — Phase 7: Evidence Quality Upgrade

### What was done

**`src/core/memory.js`**
- Added session-cycle tracking: `_mountCycles`, `_currentMountCycle`, `_cycleSeq`
- `_startNewMountCycle()` fires on module init and on every `visibilitychange → visible` event
- `_mountCycleRecord(tag, field)` called from `attach()` and `detach()` — records per-tag mount/unmount counts within each cycle
- Exposed `window.__LDS_MOUNT_CYCLES__` for debugging and report capture
- `__LDS_MEMORY_RESET__` now also clears cycles and starts a fresh cycle

**`src/panel/LdsDebugPanel.js`**
- `_collectReport()` now includes `mountCycles: window.__LDS_MOUNT_CYCLES__[...]` snapshot
- `_isProgressiveLeakFromReport(tag, mountCycles)` — returns true if active count grew monotonically across ≥3 completed cycles
- `_computeEvidenceLevel(issue, report)` — maps issueType + signal richness to five-level ladder: `observation | correlation | attribution | lifetime-violation | causality-confirmed`
- All 8 `issues.push()` sites in `_buildPinpointIssues` now add `evidenceLevel` and `observed` data
- Memory leak detection upgraded: `progressive-leak` (multi-cycle) → `correlation`; `mount-storm` (single snapshot) → `observation`
- `_exportFixTable`: `claudePrompt` string replaced by structured `evidenceCapsule` object `{ problem, component, file, line, evidenceLevel, observed, callStack, recommendation, relatedComponents, claudePrompt }`
- Pinpoint issue cards show an `evidence-badge` chip next to the severity badge, colour-coded by level
- CSS added for `.evidence-badge` and `.evl-*` classes

### Key design decisions
- `window.__LDS_MOUNT_CYCLES__` vs `window.__LDS_CYCLES__`: the existing `__LDS_CYCLES__` is the circular-update detector (directed graph DFS). Mount cycles are stored separately as `__LDS_MOUNT_CYCLES__`.
- Progressive leak requires all completed cycles to show growth (not just majority) to keep false-positive rate low. A page that is visited 3 times and each time leaves more active instances is a strong signal.
- `evidenceCapsule.claudePrompt` is kept as a string inside the capsule for backwards compatibility with scripts that read the fix table.

### Phase 7 kill test (to run)
Run on 5 real bugs. If evidence levels don't reduce Claude's false-fix rate vs Phase 6 Fix Table, revert to the simpler format.

---

## Session 2026-10-06 — Phase 8: Verification Loop

### What was done

**`src/panel/LdsDebugPanel.js`**
- Added three new state fields to constructor: `_baseline`, `_replayState`, `_verifiedIssues`; calls `_loadBaseline()` on construct to restore persisted baseline from `localStorage`

**Baseline capture:**
- `_captureBaseline()` — snapshots `window.__LDS_MEMORY__` + `window.__LDS_PERF__` + error counts into `this._baseline = { capturedAt, components: { tag: { active, mounted, avgMs, maxMs, errorCount } } }`; persists to `localStorage.__lds_baseline`
- `_clearBaseline()` — clears both in-memory and localStorage copy
- Pinpoint tab header shows "📸 Capture Baseline" when none set; shows "📸 Baseline: HH:MM:SS ✕" chip when one is active

**Replay flow:**
- `_startReplay(issue)` — sets `_replayState = { issueId, component, status: 'waiting' }`; no-ops if replay already active
- `_completeReplay()` — calls `_snapshotForTag(tag)` (reads live globals at that moment), calls `_buildComparison(issue, endSnap)`, stores result in `_verifiedIssues[issueId]`
- `_cancelReplay()` — clears `_replayState`
- `_renderReplayBanner()` — shows green "▶ Replaying <tag>" bar with "✓ Done" + "✕ Cancel" during replay; shows blue result banner after completion

**Comparison logic (`_buildComparison`):**
- "Before" values come from `this._baseline.components[tag]` if baseline exists, else from `issue.observed`
- "After" values come from end-of-replay live snapshot
- Per-issueType metric mapping: `memory-leak` → active instances; `high-avg-tti` → avgMs + maxMs; `runtime-error` → error count; `network-error` → failed requests; `property-thrash` → thrash count; default → active instances
- `overallVerified = true` when any metric shows ≥70% reduction

**UI additions:**
- `_renderVerificationBlock(issue)` — inline block inside expanded issue card: before/after metric rows with ✅/↓/↑ indicators; strikethrough "before" value, green "after" value
- `✅ VERIFIED` badge added to issue card header when `overallVerified` is true
- "▶ Replay to verify fix" button in each expanded issue body; shows "⏳ Replay active" when that issue's replay is running

**Export:**
- `_exportFixTable()` now reads `_verifiedIssues[i.id]` and adds `evidenceCapsule.verification: { status, metrics, comparedAt }` (null when no replay run)

**CSS added:** `.fix-verified-badge`, `.baseline-badge`, `.baseline-clear`, `.replay-banner`, `.replay-banner.replay-done`, `.verification-block`, `.verify-*` classes

### Key design decisions
- Baseline lives in `localStorage` so it survives panel open/close within a browser session, but is NOT synced or durable
- `_snapshotForTag` reads live globals directly (not the last collected report) so comparison is against current app state after the engineer's fix
- `overallVerified` requires ≥70% on ANY tracked metric for that issue type — intentionally lenient so a partial fix still shows improvement without claiming full verification
- `_replayState` is session-only (not persisted); `_verifiedIssues` is session-only too — restores are not needed since verification only makes sense in the session where you applied the fix

### Phase 8 kill test (to run)
Does this measurably reduce "did my fix work?" manual profiler runs? If engineers still open DevTools after using Replay, the feature hasn't earned its place.

---

## Source reference
Original files read from `D:\Work\R7\generic-changes\ui-platform-elements\src\base\`:
- `ruf-vitals.js` → `src/core/vitals.js`
- `ruf-console.js` → `src/core/console.js`
- `ruf-network.js` → `src/core/network.js` + `custom/ui-platform/FalcorDecoder.js`
- `ruf-perf.js` → `src/core/perf.js` (Lit-only; removed Polymer `ready()` path)
- `ruf-prop-audit.js` → `src/core/prop-audit.js` (Lit-only; removed `_propertiesChanged`)
- `ruf-error-boundary.js` → `src/core/error-boundary.js` (Lit-only; crash endpoint from `__LDS_CRASH_ENDPOINT__`)
- `ruf-cycle-detector.js` → `src/core/cycle-detector.js`
- `ruf-inspector.js` → `src/core/inspector.js` (removed Syndigo context; added `__LDS_CONTEXT_GETTER__` hook)
- `ruf-aci-tracer.js` → `src/core/event-tracer.js` + `custom/ui-platform/AciPlugin.js`
- `ruf-slow-api.js` → `src/core/slow-api.js` + `custom/ui-platform/SyndigoSlowApiPlugin.js`
- `ruf-memory.js` → `src/core/memory.js`
- `ruf-debug-panel.js` → `src/panel/LdsDebugPanel.js`
