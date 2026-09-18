# lit-debug-suite — Session Handover

**Date:** 2026-09-18  
**Status:** COMPLETE — implementation + build configs + extension bug fixed + full docs  
**What remains:** npm install + build + place icon PNGs + browser-test panel (see §1, §5)

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
