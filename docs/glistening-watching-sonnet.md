# Plan: lit-debug-suite — Generic Lit Debug Package + Chrome Extension

## Context

Extract the 12-tool RUF Debug Suite from Syndigo's `ui-platform-elements` into a standalone,
publishable package at `D:\Work\R7\generic-changes\perf-tool\lit\`. The result is:

1. **`lit-debug-suite`** — an npm-publishable package any Lit project can use
2. **Chrome extension** — published to Chrome Web Store; any user installs once; injects the debug
   panel into any Lit app that has activated the suite
3. **`custom/ui-platform/`** — Syndigo-specific code (Falcor, DataObjectManager, ACI) isolated in
   one folder; `ui-platform-elements` imports from here going forward

**Why Chrome extension over VSCode:** The core support workflow requires no DevTools access. A
floating panel injected by the extension works for support engineers, QA, and non-technical
customers equally. VSCode is secondary (codebase-access only); Chrome extension covers production
sessions with real data.

---

## Target directory layout

```
D:\Work\R7\generic-changes\perf-tool\lit\
├── src/
│   ├── core/                 # Zero framework deps — pure browser APIs, window globals
│   │   ├── gate.js           # __LDS_DEBUG__ flag resolution
│   │   ├── memory.js         # FinalizationRegistry counters
│   │   ├── vitals.js         # PerformanceObserver (LCP, CLS, INP, Long Tasks)
│   │   ├── console.js        # console.error/warn ring buffer
│   │   ├── network.js        # fetch/XHR patch + NetworkDecoder plugin dispatch
│   │   ├── perf.js           # TTI tracker — render-complete via adapter
│   │   ├── prop-audit.js     # Thrash detector — prop hooks via adapter
│   │   ├── error-boundary.js # Crash catcher — render wrap via adapter
│   │   ├── cycle-detector.js # DFS cycle graph — render + prop hooks via adapter
│   │   └── inspector.js      # Hover overlay — configurable context provider
│   │
│   ├── adapter/
│   │   ├── FrameworkAdapter.js     # Interface definition (base class)
│   │   └── lit/
│   │       └── LitAdapter.js       # Lit 3 implementation of FrameworkAdapter
│   │
│   ├── mixin/
│   │   └── LitDebugMixin.js        # The one file users add to their base element
│   │
│   ├── panel/
│   │   └── debug-panel.js          # Syndigo-free port of ruf-debug-panel.js
│   │
│   ├── plugins/
│   │   ├── NetworkDecoder.js       # Interface — implement to decode custom protocols
│   │   ├── rest/
│   │   │   └── RestDecoder.js      # Default decoder (URL, method, status, timing)
│   │   └── SlowApiPlugin.js        # Interface — implement to instrument custom API clients
│   │
│   └── index.js                    # Public exports
│
├── custom/
│   └── ui-platform/                # ALL Syndigo-specific code lives here only
│       ├── index.js                # Registers all Syndigo plugins on import
│       ├── FalcorDecoder.js        # Full Falcor POST + GET decoder (from ruf-network.js)
│       ├── DataObjectManagerPlugin.js  # DataObjectManager patch (from ruf-slow-api.js)
│       ├── AciTracerPlugin.js      # ACI el.aci patch, frequency table (from ruf-aci-tracer.js)
│       └── UiPlatformInspectorConfig.js # Context fields, _SKIP_REPLAY_PROPS (from ruf-inspector.js)
│
├── chrome-extension/
│   ├── manifest.json               # Manifest V3
│   ├── content-script.js           # Injects <lit-debug-panel> shadow host into page
│   ├── background.js               # Service worker — handles icon click toggle
│   ├── options.html                # Extension options: URL patterns, tool selection
│   └── panel/
│       ├── panel.html              # Standalone panel page for extension popup
│       └── panel.bundle.js         # Built bundle: debug-panel.js + Lit
│
├── package.json                    # name: "lit-debug-suite", type: module
└── README.md
```

---

## Global namespace

All globals renamed from `__RUF_*` to `__LDS_*` (LitDebugSuite) throughout the generic package.
Syndigo migration: `custom/ui-platform/index.js` aliases `__LDS_*` back to `__RUF_*` so any
existing support tooling or saved reports that reference `__RUF_*` names continue to work during
transition.

| Old (RUF) | New (LDS) |
|-----------|-----------|
| `window.__RUF_DEBUG__` | `window.__LDS_DEBUG__` |
| `window.__RUF_PERF__` | `window.__LDS_PERF__` |
| `window.__RUF_ERRORS__` | `window.__LDS_ERRORS__` |
| `window.__RUF_NETWORK_LOG__` | `window.__LDS_NETWORK_LOG__` |
| `window.__RUF_VITALS__` | `window.__LDS_VITALS__` |
| `window.__RUF_MEMORY__` | `window.__LDS_MEMORY__` |
| `window.__RUF_CONSOLE__` | `window.__LDS_CONSOLE__` |
| `window.__RUF_RENDER_REASONS__` | `window.__LDS_RENDER_REASONS__` |
| `window.__RUF_THRASH__` | `window.__LDS_THRASH__` |
| `window.__RUF_CYCLES__` | `window.__LDS_CYCLES__` |
| `window.__RUF_ACI_TIMELINE__` | `window.__LDS_EVENTS_TIMELINE__` |
| `window.__RUF_ACI_FREQ__` | `window.__LDS_EVENTS_FREQ__` |
| `window.__RUF_SLOW_API_LOG__` | `window.__LDS_SLOW_API_LOG__` |
| `window.__RUF_HISTORY__` | `window.__LDS_HISTORY__` |
| `window.__RUF_SESSION_ID__` | `window.__LDS_SESSION_ID__` |
| `window.__RUF_SLOW_RENDERS__` | `window.__LDS_SLOW_RENDERS__` |
| `window.__RUF_STORMS__` | `window.__LDS_STORMS__` |

---

## FrameworkAdapter interface (`src/adapter/FrameworkAdapter.js`)

```js
export class FrameworkAdapter {
  // Wrap the element's render cycle (for error-boundary and cycle-detector)
  wrapRenderCycle(el, fn) {}
  // Undo wrapRenderCycle — called on detach
  unwrapRenderCycle(el) {}
  // Hook into per-property change notifications (for prop-audit and cycle-detector)
  hookPropChange(el, cb) {}   // cb(name, oldValue, newValue)
  // Undo hookPropChange
  unhookPropChange(el) {}
  // Hook into post-render diff (for prop-audit render reasons)
  hookAfterRender(el, cb) {}  // cb(changedMap)
  unhookAfterRender(el) {}
  // Promise<void> that resolves after the next render (for perf TTI)
  renderCompletePromise(el) { return Promise.resolve(); }
  // Declared reactive properties as {[name]: descriptor}
  getDeclaredProps(el) { return {}; }
  // True if this adapter manages this element type
  isManaged(el) { return false; }
}
```

## LitAdapter (`src/adapter/lit/LitAdapter.js`)

Implements all six hook methods using Lit 3 internals:

| Adapter method | Lit implementation |
|---|---|
| `wrapRenderCycle(el, fn)` | Patches `el.performUpdate` with `async` try/finally; sentinel `__ldsEBPatched` |
| `unwrapRenderCycle(el)` | Restores original `performUpdate` from stored `__ldsOrigPerformUpdate` |
| `hookPropChange(el, cb)` | Patches `el.requestUpdate(name, old)` sentinel `__ldsPropHook` |
| `unhookPropChange(el)` | Restores `__ldsOrigRequestUpdate` |
| `hookAfterRender(el, cb)` | Patches `el.updated(changedMap)` sentinel `__ldsAfterRenderHook` |
| `renderCompletePromise(el)` | `el.updateComplete` |
| `getDeclaredProps(el)` | `el.constructor.properties \|\| {}` |
| `isManaged(el)` | `typeof el.requestUpdate === 'function'` |

No Polymer branches — Polymer stays only in `ui-platform-elements`. The generic adapter is Lit-only.

---

## Per-file changes from RUF originals

### `src/core/gate.js` (from `ruf-element.js` flag logic)
- Extract `_getDebugFlag()` and `_toolEnabled()` only
- Remove all `OSElements.mainApp.globalSettings` reads — replace with
  `window.__LDS_APP_CONFIG__?.debugEnabled` (optional global config object any app can set)
- Rename `__RUF_DEBUG__` → `__LDS_DEBUG__`; per-tool flags `__RUF_*_ENABLED__` → `__LDS_*_ENABLED__`

### `src/core/memory.js` (from `ruf-memory.js`)
- Rename `__RUF_*` → `__LDS_*` only. No other changes — file was 100% generic.

### `src/core/vitals.js` (from `ruf-vitals.js`)
- Rename `__RUF_*` → `__LDS_*` only. No other changes — file was 100% generic.

### `src/core/console.js` (from `ruf-console.js`)
- Rename `__RUF_*` → `__LDS_*` only. No other changes — file was 100% generic.

### `src/core/network.js` (from `ruf-network.js`)
- Keep entire fetch/XHR monkey-patch + log structure
- Remove `_parseFalcorBody`, `_parseFalcorGetUrl`, `_resolveFalcor` entirely
- Add plugin dispatch after raw entry is built:
  ```js
  const decoded = _decoders.reduce((acc, p) => acc || (p.matches(url, method, body) ? p.decode(url, method, body) : null), null);
  entry.decoded = decoded; // null until a plugin matches
  ```
- Export `registerDecoder(plugin)` for consumer registration
- Rename `__RUF_*` → `__LDS_*`

### `src/core/perf.js` (from `ruf-perf.js`)
- `attach(el, adapter)` — add `adapter` parameter
- Replace `el.updateComplete` branch with `adapter.renderCompletePromise(el).then(...)`
- Replace `el.ready` Polymer patch with nothing (Polymer lifecycle stays in `ui-platform`)
- Rename `__RUF_*` → `__LDS_*`

### `src/core/prop-audit.js` (from `ruf-prop-audit.js`)
- `attach(el, adapter)` — add `adapter` parameter
- Remove direct `el.requestUpdate`, `el.updated`, `el._propertiesChanged` patches
- Replace with `adapter.hookPropChange(el, (name, old, next) => _onPropChange(el, name, old, next))`
  and `adapter.hookAfterRender(el, (map) => _onAfterRender(el, map))`
- `detach(el, adapter)` — calls `adapter.unhookPropChange(el)` + `adapter.unhookAfterRender(el)`
- Rename `__RUF_*` → `__LDS_*`

### `src/core/error-boundary.js` (from `ruf-error-boundary.js`)
- `attach(el, adapter)` — add `adapter` parameter
- Remove direct `el.performUpdate`, `el._propertiesChanged` patches
- Replace with `adapter.wrapRenderCycle(el, fn)`
- `detach(el, adapter)` — calls `adapter.unwrapRenderCycle(el)`
- Replace `mainApp.globalSettings.rufCrashEndpoint` + `.rufCrashAutoPost` with
  `window.__LDS_CRASH_ENDPOINT__` + `window.__LDS_CRASH_AUTO_POST__`
- Rename `__RUF_*` → `__LDS_*`

### `src/core/cycle-detector.js` (from `ruf-cycle-detector.js`)
- `attach(el, adapter)` — add `adapter` parameter
- Remove direct `el.performUpdate`, `el.requestUpdate` patches
- Replace with `adapter.wrapRenderCycle` + `adapter.hookPropChange`
- `detach(el, adapter)` — calls `adapter.unwrapRenderCycle(el)` + `adapter.unhookPropChange(el)`
- Rename `__RUF_*` → `__LDS_*`

### `src/core/inspector.js` (from `ruf-inspector.js`)
- Remove hardcoded Syndigo context fields (`tenantId`, `userId`, `roles`, `defaultRole`, etc.)
- Replace with: `let _contextProvider = (el) => ({})` — configurable
- Remove `el.__data` Polymer internal bag read
- Replace `el.constructor.properties` read with `adapter.getDeclaredProps(el)` 
- Remove `_SKIP_REPLAY_PROPS` Syndigo list; replace with `let _skipProps = new Set()`
- Export `configure({ contextProvider, skipProps })` for customisation
- Rename `__RUF_*` → `__LDS_*`

### `src/panel/debug-panel.js` (from `ruf-debug-panel.js`)
- Import `LitElement, html, css` from `'lit'` — kept (panel IS a LitElement)
- Rename all `__RUF_*` → `__LDS_*`
- ACI tab: rename to "Events", key `events`, reads `__LDS_EVENTS_TIMELINE__` + `__LDS_EVENTS_FREQ__`
- Network tab: change `entry.falcor` → `entry.decoded`; display whatever decoder returned (generic
  key-value display instead of Falcor-specific field names)
- `_tagToFilePath(tag)`: replace Syndigo path convention with pluggable resolver:
  `window.__LDS_FILE_PATH_RESOLVER__?.(tag) ?? tag`
- Fix Table `claudePrompt` field: make it a configurable template or remove by default
  (add back via `window.__LDS_FIX_TABLE_PROMPT_FN__(issue)`)
- Remove all `rock-*`/`pebble-*`/`bedrock-*` example strings from recommendation text
- Remove `OSElements`, `mainApp` references (none existed in the panel anyway — confirmed by exploration)

### `src/mixin/LitDebugMixin.js` (new file)
Mirror of `ruf-element.js` attach/detach wiring, rewritten for the generic package:
```js
import { LitAdapter } from '../adapter/lit/LitAdapter.js';
import { toolEnabled } from '../core/gate.js';
import * as perf from '../core/perf.js';
import * as propAudit from '../core/prop-audit.js';
import * as errorBoundary from '../core/error-boundary.js';
import * as cycleDetector from '../core/cycle-detector.js';
import * as memory from '../core/memory.js';
import * as network from '../core/network.js';
import * as vitals from '../core/vitals.js';
import * as consoleCapture from '../core/console.js';
import * as inspector from '../core/inspector.js';

export const LitDebugMixin = (superclass) => class extends superclass {
  connectedCallback() {
    super.connectedCallback();
    const adapter = new LitAdapter();
    if (toolEnabled('perf'))          perf.attach(this, adapter);
    if (toolEnabled('propAudit'))     propAudit.attach(this, adapter);
    if (toolEnabled('errorBoundary')) errorBoundary.attach(this, adapter);
    if (toolEnabled('cycleDetector')) cycleDetector.attach(this, adapter);
    if (toolEnabled('memory'))        memory.attach(this);
    if (toolEnabled('network'))       network.init();    // page-level singleton
    if (toolEnabled('vitals'))        vitals.init();     // page-level singleton
    if (toolEnabled('console'))       consoleCapture.init(); // page-level singleton
    if (toolEnabled('inspector'))     inspector.attach(this, adapter);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    const adapter = new LitAdapter();
    perf.detach(this);
    propAudit.detach(this, adapter);
    errorBoundary.detach(this, adapter);
    cycleDetector.detach(this, adapter);
    memory.detach(this);
    inspector.detach(this);
  }
};
```

---

## Plugin interfaces

### `src/plugins/NetworkDecoder.js`
```js
export class NetworkDecoder {
  get name() { return 'Unknown'; }
  matches(url, method, body) { return false; }
  decode(url, method, body) { return null; } // returns plain object or null
}
```

### `src/plugins/rest/RestDecoder.js`
Default no-op decoder — always matches, returns `{ protocol: 'REST', url, method }`.
Registered by default in `src/core/network.js`.

### `src/plugins/SlowApiPlugin.js`
```js
export class SlowApiPlugin {
  get name() { return 'Unknown'; }
  patch(windowScope) {} // wraps the API client's methods
  unpatch() {}
}
```

---

## Custom Syndigo layer (`custom/ui-platform/`)

### `index.js`
Imports and registers all plugins. Users import this once in their app entry (e.g. `app-base.js`):
```js
import 'lit-debug-suite/custom/ui-platform/index.js';
```
Registers: FalcorDecoder, DataObjectManagerPlugin, AciTracerPlugin. Configures inspector context.
Also aliases `__LDS_*` → `__RUF_*` on window for backwards compatibility during migration.

### `FalcorDecoder.js`
Implements `NetworkDecoder`. Contains full `_parseFalcorBody` + `_parseFalcorGetUrl` logic ported
verbatim from `ruf-network.js`. `matches()` returns true for form-encoded bodies with `callPath`
field or URLs matching `/data/*.json?paths=`.

### `DataObjectManagerPlugin.js`
Implements `SlowApiPlugin`. Contains `_patchDataObjectManager` ported from `ruf-slow-api.js`.
`patch()` looks for `window.__dataObjectManager__` or `window.RUFUtilities.dataObjectManager` and
wraps `get`, `post`, `rest`, `initiateRequest`. Writes to `window.__LDS_SLOW_API_LOG__`.

### `AciTracerPlugin.js`
Contains ACI dispatch patching from `ruf-aci-tracer.js`. Reads `el.aci` on connect (Syndigo-
specific mixin property). Writes to `window.__LDS_EVENTS_TIMELINE__` + `window.__LDS_EVENTS_FREQ__`.
The panel's Events tab reads these generically.

### `UiPlatformInspectorConfig.js`
Exports a `contextProvider(el)` function that reads Syndigo-specific properties (`tenantId`,
`userId`, `roles`, `defaultRole`, `appId`, `ownershipData`, `state`, `contextData`).
Exports `SKIP_PROPS` set with Syndigo field names. Called from `index.js` via
`configureInspector({ contextProvider, skipProps: SKIP_PROPS })`.

---

## Chrome Extension (`chrome-extension/`)

### `manifest.json`
Manifest V3. `content_scripts` runs `content-script.js` on all URLs with `document_idle`.
Permissions: `activeTab`, `scripting`, `storage`.

### `content-script.js`
Logic:
1. Check `window.__LDS_DEBUG__` on load
2. If truthy (or becomes truthy via `window.__lds_activate__`): create `<div id="__lds_host__">`,
   attach a shadow root, inject `<lit-debug-panel>` custom element inside it
3. The panel reads `window.__LDS_*` directly (same origin, content scripts share the page window)
4. The host div is positioned fixed, z-index 2147483647, pointer-events none except for the badge
5. If falsy on load, inject a tiny activation listener: `window.__lds_activate__ = () => { ... }`
   so `window.__LDS_DEBUG__ = true` in the console still triggers injection

### `background.js`
Service worker. On extension icon click:
- Executes `window.__LDS_DEBUG__ = !window.__LDS_DEBUG__` in the active tab
- Updates the extension icon badge (ON/OFF indicator)

### `panel/panel.bundle.js`
Pre-built bundle containing `debug-panel.js` + Lit 3 (~6KB). Build step: esbuild or rollup.
Used by `panel.html` for a standalone popup view (alternative to injected panel).

---

## `package.json` (root)

```json
{
  "name": "lit-debug-suite",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./mixin": "./src/mixin/LitDebugMixin.js",
    "./panel": "./src/panel/debug-panel.js",
    "./plugins/network": "./src/plugins/NetworkDecoder.js",
    "./plugins/slow-api": "./src/plugins/SlowApiPlugin.js",
    "./custom/ui-platform": "./custom/ui-platform/index.js"
  },
  "peerDependencies": { "lit": ">=3.0.0" },
  "devDependencies": { "esbuild": "^0.21.0" }
}
```

---

## Files to create (complete list)

| File | Source | Changes |
|------|--------|---------|
| `src/core/gate.js` | `ruf-element.js` (flag methods only) | Remove OSElements; `__RUF_` → `__LDS_`; add `__LDS_APP_CONFIG__` support |
| `src/core/memory.js` | `ruf-memory.js` | `__RUF_` → `__LDS_` only |
| `src/core/vitals.js` | `ruf-vitals.js` | `__RUF_` → `__LDS_` only |
| `src/core/console.js` | `ruf-console.js` | `__RUF_` → `__LDS_` only |
| `src/core/network.js` | `ruf-network.js` | Remove Falcor parsers; add decoder plugin loop; `__RUF_` → `__LDS_` |
| `src/core/perf.js` | `ruf-perf.js` | Add `adapter` param; remove `updateComplete`/`ready` direct; `__RUF_` → `__LDS_` |
| `src/core/prop-audit.js` | `ruf-prop-audit.js` | Add `adapter` param; remove direct hook patches; `__RUF_` → `__LDS_` |
| `src/core/error-boundary.js` | `ruf-error-boundary.js` | Add `adapter` param; remove direct patches; crash config → `__LDS_CRASH_*`; `__RUF_` → `__LDS_` |
| `src/core/cycle-detector.js` | `ruf-cycle-detector.js` | Add `adapter` param; remove direct patches; `__RUF_` → `__LDS_` |
| `src/core/inspector.js` | `ruf-inspector.js` | Remove Syndigo context fields; add `configure()`; use `adapter.getDeclaredProps`; `__RUF_` → `__LDS_` |
| `src/adapter/FrameworkAdapter.js` | New | Full interface definition |
| `src/adapter/lit/LitAdapter.js` | New | Lit 3 implementation |
| `src/mixin/LitDebugMixin.js` | New | Wiring logic from `ruf-element.js` connectedCallback |
| `src/panel/debug-panel.js` | `ruf-debug-panel.js` | ACI→Events; `entry.falcor`→`entry.decoded`; `_tagToFilePath` pluggable; remove Syndigo strings; `__RUF_`→`__LDS_` |
| `src/plugins/NetworkDecoder.js` | New | Interface |
| `src/plugins/rest/RestDecoder.js` | New | Default REST decoder |
| `src/plugins/SlowApiPlugin.js` | New | Interface |
| `src/index.js` | New | All public exports |
| `custom/ui-platform/index.js` | New | Registers all Syndigo plugins; aliasing `__LDS_*` → `__RUF_*` |
| `custom/ui-platform/FalcorDecoder.js` | `ruf-network.js` (Falcor section) | Implements NetworkDecoder |
| `custom/ui-platform/DataObjectManagerPlugin.js` | `ruf-slow-api.js` | Implements SlowApiPlugin |
| `custom/ui-platform/AciTracerPlugin.js` | `ruf-aci-tracer.js` | ACI bus patch; writes `__LDS_EVENTS_*` |
| `custom/ui-platform/UiPlatformInspectorConfig.js` | `ruf-inspector.js` (context section) | contextProvider + SKIP_PROPS |
| `chrome-extension/manifest.json` | New | Manifest V3 |
| `chrome-extension/content-script.js` | New | Panel injection logic |
| `chrome-extension/background.js` | New | Icon toggle service worker |
| `chrome-extension/options.html` | New | URL pattern config + tool toggles |
| `chrome-extension/panel/panel.html` | New | Standalone popup page |
| `package.json` | New | Package definition with exports map |
| `README.md` | New | Quick-start + plugin API docs |

---

## What does NOT change in `ui-platform-elements`

The `src/base/ruf-*.js` files in `ui-platform-elements` are untouched in this task.
After the generic package is built and tested, a follow-up task will:
1. Replace `ruf-element.js` wiring to import `LitDebugMixin` from `lit-debug-suite`
2. Move `ruf-aci-tracer.js`, Falcor parts of `ruf-network.js`, and `ruf-slow-api.js` into
   `custom/ui-platform/`
3. Delete the now-redundant `src/base/ruf-*.js` files that have generic equivalents

---

## Verification

1. `cd D:\Work\R7\generic-changes\perf-tool\lit && npm install`
2. Load Chrome extension: `chrome://extensions` → Developer mode → Load unpacked → `chrome-extension/`
3. In any Lit project (or the storybook demo):
   ```js
   import { LitDebugMixin } from 'lit-debug-suite/mixin';
   class MyBase extends LitDebugMixin(LitElement) { ... }
   ```
4. In browser console: `window.__LDS_DEBUG__ = true` → 🐞 badge appears
5. Click badge → panel opens → verify all 12 tabs populate
6. Selective: `window.__LDS_DEBUG__ = { perf: true, network: true }` → only those two tools active
7. Syndigo path: import `lit-debug-suite/custom/ui-platform` in app entry → verify Falcor column
   in Network tab + DataObjectManager in Slow API tab
8. Chrome extension toggle: click extension icon → badge appears without console command
