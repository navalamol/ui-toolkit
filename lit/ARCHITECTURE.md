# lit-debug-suite — Architecture & LLM Context

This document gives a complete mental model of the package: what it is, how every
layer works, where Syndigo-specific code lives, and exactly what an LLM needs to
know to continue work on it without re-reading all source files.

---

## 1. What this package is

`lit-debug-suite` is a **zero-overhead debug suite** for LitElement applications.
It was extracted verbatim from the Syndigo `ruf-debug-panel` (12-tool system inside
`ui-platform-elements/src/base/`) and refactored into a publishable, framework-
generic npm package.

**Three ways to use it:**
| Mode | What you get |
|------|-------------|
| Chrome extension (no app changes) | Vitals + Network + Console tabs always; other tabs empty unless mixin is installed |
| Mixin only (no panel) | All 12 tools collect data to `window.__LDS_*` globals; no UI |
| Mixin + panel | Full floating panel with all 12 tabs populated |

---

## 2. Directory layout (annotated)

```
lit-debug-suite/
├── src/
│   ├── core/                    ← 12 standalone tools, ZERO framework deps
│   │   ├── gate.js              ← master on/off, per-tool flags
│   │   ├── memory.js            ← mount/unmount/GC via FinalizationRegistry
│   │   ├── perf.js              ← TTI + slow render tracking
│   │   ├── error-boundary.js   ← wraps performUpdate, auto-POST crashes
│   │   ├── prop-audit.js        ← render reasons (R2-A), property thrash (R2-B)
│   │   ├── inspector.js         ← hover badge overlay, prop snapshot
│   │   ├── cycle-detector.js    ← DFS cycle detection in update chains
│   │   ├── event-tracer.js      ← custom event frequency table + timeline
│   │   ├── slow-api.js          ← wraps objects to track slow method calls
│   │   ├── console.js           ← console.error/warn ring buffer
│   │   ├── vitals.js            ← LCP, CLS, INP, Long Tasks (PerformanceObserver)
│   │   └── network.js           ← fetch + XHR patch, decoder plugin hook
│   │
│   ├── adapter/
│   │   ├── FrameworkAdapter.js  ← abstract base (6 methods to implement)
│   │   └── lit/
│   │       └── LitAdapter.js    ← Lit 3 concrete impl (performUpdate etc.)
│   │
│   ├── panel/
│   │   └── LdsDebugPanel.js     ← full 12-tab panel (~1400 lines LitElement)
│   │                               registers <lds-debug-panel> custom element
│   ├── LitDebugMixin.js         ← drop-in mixin — add to any LitElement class
│   └── index.js                 ← barrel export of everything
│
├── custom/
│   └── ui-platform/             ← ALL Syndigo-specific code lives here ONLY
│       ├── FalcorDecoder.js     ← decodeFalcor(url, body) → decoded object
│       ├── AciPlugin.js         ← attachToElement(el), installGlobalAciPatch()
│       ├── SyndigoSlowApiPlugin.js ← finds/retries window.__dataObjectManager__
│       ├── compat.js            ← __RUF_* → __LDS_* live getter aliases
│       └── index.js             ← registers all three plugins on import
│
├── extension/
│   ├── manifest.json            ← Chrome MV3; permissions: activeTab+scripting+storage
│   ├── background.js            ← service worker: icon click → toggle via MAIN world
│   ├── content.js               ← isolated world; only handles app-set __LDS_DEBUG__
│   └── panel-host.js            ← DEPRECATED; kept for dev-only reference
│
├── test/
│   └── panel-test.html          ← browser dev harness (import-map CDN Lit)
│
├── rollup.extension.config.js   ← bundles panel + Lit → extension/panel.bundle.js
├── rollup.lib.config.js         ← ESM lib/ output (Lit external peer)
└── package.json
```

---

## 3. The global namespace

Every runtime artifact lives on `window` under the `__LDS_` prefix.
No `__RUF_` globals exist in the generic package — see §8 for compat aliases.

### Control globals (set by you / the extension)
| Global | Type | Purpose |
|--------|------|---------|
| `__LDS_DEBUG__` | `true \| false \| { toolKey: bool }` | Master gate |
| `__LDS_APP_CONFIG__` | `{ debugEnabled: bool }` | App-level config fallback |
| `__LDS_CRASH_ENDPOINT__` | `string` | URL for auto-POST on render crash |
| `__LDS_CRASH_AUTO_POST__` | `bool` | Enable crash auto-POST |
| `__LDS_CONTEXT_GETTER__` | `(el) => object` | Extra fields in inspector snapshot |
| `__LDS_TAG_TO_FILE__` | `(tag) => string` | Maps element tag → source file path |
| `__LDS_EVENTS_TRACE__` | `bool` | Enable event timeline recording |
| `__LDS_EVENTS_FILTER__` | `string[]` | Filter events by name (all if unset) |
| `__LDS_PROP_DEBUG__` | `string \| '*'` | Per-element prop change logging |
| `__LDS_SLOW_API_MS__` | `number` | Slow API threshold ms (default 1000) |
| `__LDS_THRASH_THRESHOLD__` | `number` | Prop sets/sec before thrash alert (default 5) |
| `__LDS_STACK_FILTER_RE__` | `RegExp` | Stack frame app-only filter |

### Data globals (written by tools, read by the panel)
| Global | Written by | Contents |
|--------|-----------|---------|
| `__LDS_PERF__` | perf.js | `{ [tag]: { tti, renders } }` |
| `__LDS_SLOW_RENDERS__` | perf.js | `Array<{ tag, elapsed, ts }>` |
| `__LDS_ERRORS__` | error-boundary.js | `Array<{ tag, message, stack, ts }>` |
| `__LDS_RENDER_REASONS__` | prop-audit.js | `{ [tag]: Array<{ props, ts }> }` |
| `__LDS_THRASH__` | prop-audit.js | `Array<{ tag, prop, count, ts }>` |
| `__LDS_CYCLES__` | cycle-detector.js | `Array<string[]>` (chains) |
| `__LDS_EVENT_LOG__` | event-tracer.js | `{ timeline: [], freq: {} }` |
| `__LDS_SLOW_API_LOG__` | slow-api.js | `Array<{ method, elapsed, ts }>` |
| `__LDS_CONSOLE__` | console.js | `Array<{ level, args, ts }>` |
| `__LDS_VITALS__` | vitals.js | `{ lcp, cls, inp, longTasks }` |
| `__LDS_NETWORK_LOG__` | network.js | `Array<NetworkEntry>` (see §6) |
| `__LDS_MEMORY__` | memory.js | `{ mounted: Set, unmounted: [], gcCount }` |
| `__LDS_STORMS__` | memory.js | `Array<{ tag, count, ts }>` (mount storms) |
| `__LDS_HISTORY__` | panel | `Array<snapshot>` (manual snapshots) |
| `__LDS_SESSION_ID__` | panel | unique session string |

---

## 4. How the mixin works

`LitDebugMixin(superclass)` wraps any `LitElement` subclass.

```
connectedCallback()
  └─ _initPageTools() [once per page]
       ├─ vitals.init()   — starts PerformanceObserver
       └─ network.init()  — patches fetch + XHR
  └─ memory.attach(this)         — always-on
  └─ errorBoundary.attach(this)  — always-on
  └─ [if enabled] perf.attach(this)
  └─ [if enabled] propAudit.attach(this)
  └─ [if enabled] inspector.attach(this)
  └─ [if enabled] cycleDetector.attach(this)
  └─ [if enabled] eventTracer.attach(this)
  └─ [if enabled] slowApiMonitor.attach(this)
  └─ [if enabled] console.attach(this)

disconnectedCallback()
  └─ detach() called on all tools (idempotent, no-throw)
```

Each tool's `attach(el)` method stores a WeakRef and patches LitElement lifecycle
methods (e.g. `performUpdate`, `requestUpdate`, `updated`) on the element instance
(not the prototype) so patching is isolated per element.

---

## 5. How the Chrome extension works

### Data flow (click toolbar icon → panel visible)

```
User clicks toolbar icon
  │
  ▼
background.js (service worker — isolated from page)
  │  reads chrome.storage.session for tab state
  │  toggles: false → true
  │
  ├─ executeScript(world:'MAIN', func: set window.__LDS_DEBUG__ = true)
  │    Runs inside the PAGE'S JavaScript realm
  │
  ├─ executeScript(world:'MAIN', files:['panel.bundle.js'])
  │    Injects the IIFE bundle into the PAGE realm
  │    → customElements.define('lds-debug-panel', LdsDebugPanel) runs
  │       in the PAGE's customElements registry
  │
  └─ executeScript(world:'MAIN', func: mount <lds-debug-panel>)
       document.body.appendChild(el) — panel is now visible
```

### Why MAIN world matters (critical)

Chrome extensions have two JS realms per tab:

| Realm | Who runs here | customElements registry |
|-------|--------------|------------------------|
| **MAIN world** | The page itself | Page's registry — `document.createElement('lds-debug-panel')` works |
| **Isolated world** | Content scripts (default) | Separate registry — elements defined here are invisible to the page |

If the panel bundle runs in the isolated world, `customElements.define(...)` goes
into the isolated registry. When content.js then calls `document.createElement('lds-debug-panel')`,
the page has no record of that element → it creates an `HTMLElement`, not `LdsDebugPanel` → blank.

**This is the root cause of the original error.** `panel-host.js` created a `<script>`
tag from the isolated world — the tag ran in MAIN world but `chrome.runtime` was
unavailable there, causing the null crash. The fix: always use
`executeScript({ world: 'MAIN' })` directly from the service worker.

### What content.js does (and doesn't do)

`content.js` runs in ISOLATED world. Its only job is: if the APP itself has set
`window.__LDS_DEBUG__ = true` before the extension loaded, notify the background
worker so it can inject the panel. It cannot touch custom elements.

### Files that must exist in extension/ after build

```
extension/
  manifest.json        ← checked into git
  background.js        ← checked into git
  content.js           ← checked into git
  panel.bundle.js      ← GENERATED by npm run build:extension (NOT in git)
  icons/
    icon16.png         ← any PNG placeholder (required by Chrome)
    icon48.png
    icon128.png
```

---

## 6. Network log entry shape

`LdsNetwork` calls `LdsNetwork.registerDecoder(fn)` to let plugins add decoded
metadata. `FalcorDecoder` in `custom/ui-platform/` uses this hook.

```js
// NetworkEntry shape (window.__LDS_NETWORK_LOG__ items)
{
  url:      string,
  method:   'GET' | 'POST' | ...,
  status:   number,
  duration: number,        // ms
  size:     number,        // bytes (from Content-Length or response body)
  ts:       number,        // Date.now()
  decoded:  null | {       // set by registered decoder
    protocol: 'falcor' | 'rest' | ...,
    method:   string,      // e.g. 'get', 'call', 'set'
    callPath: string,      // e.g. '[catalog,1]'
    // ... decoder-specific fields
  }
}
```

---

## 7. Adding a new tool

1. Create `src/core/my-tool.js` — export a class with `attach(el)` / `detach(el)` / `init()`.
   Write to a `window.__LDS_MY_TOOL__` global. No Lit imports.
2. Export it from `src/index.js`.
3. Import it in `src/LitDebugMixin.js` and call `attach`/`detach` in the mixin.
4. Add a tool key to `src/core/gate.js` (`_toolEnabled('myTool')`).
5. Add a tab to `src/panel/LdsDebugPanel.js` — search for `_renderEventsTab()` for a
   simple list-tab pattern to copy.

---

## 8. Syndigo compatibility (custom/ui-platform/)

The original package used `__RUF_*` globals. `custom/ui-platform/compat.js` installs
live getter aliases so code that reads `window.__RUF_PERF__` gets `window.__LDS_PERF__`.

These aliases are NOT in the core package — they only activate when you import
`lit-debug-suite/custom/ui-platform`.

**Syndigo plugin install order (happens automatically on import):**
1. `FalcorDecoder` registered with `LdsNetwork.registerDecoder(decodeFalcor)`
2. `SyndigoSlowApiPlugin.install()` — polls until `window.__dataObjectManager__` exists,
   then calls `LdsSlowApiMonitor.wrapObject(dom, [...methods])`
3. Compat aliases installed via `compat.js`

**Per-element ACI tracing** (manual, in element connectedCallback):
```js
import { attachToElement } from 'lit-debug-suite/custom/ui-platform';
connectedCallback() {
  super.connectedCallback();
  if (this.aci) attachToElement(this); // wraps this.aci.dispatch
}
```

---

## 9. Build system

| Script | Output | Notes |
|--------|--------|-------|
| `npm run build:extension` | `extension/panel.bundle.js` | Dev build, sourcemaps on |
| `npm run build:extension:prod` | `extension/panel.bundle.js` | Minified via terser |
| `npm run build:lib` | `lib/` | ESM, Lit external, tree-shakeable |
| `npm run build` | both | `lib/` + minified extension bundle |
| `npm run serve` | localhost:8080 | `npx serve .` for test/panel-test.html |

`rollup.extension.config.js` bundles Lit **inline** (extensions have no import maps).
`rollup.lib.config.js` marks Lit as external (consumers provide their own Lit).

---

## 10. Panel tab → data source map

| Tab | Key | Reads from |
|-----|-----|-----------|
| Summary | — | Aggregates from all globals |
| Pinpoint | — | Combines perf + errors + thrash |
| Vitals | vitals | `__LDS_VITALS__` |
| Network | network | `__LDS_NETWORK_LOG__` |
| Perf | perf | `__LDS_PERF__`, `__LDS_SLOW_RENDERS__` |
| Errors | errorBoundary | `__LDS_ERRORS__` |
| Console | console | `__LDS_CONSOLE__` |
| Events | eventTracer | `__LDS_EVENT_LOG__.timeline`, `.freq` |
| SlowAPI | slowApi | `__LDS_SLOW_API_LOG__` |
| Memory | memory | `__LDS_MEMORY__`, `__LDS_STORMS__` |
| History | — | `__LDS_HISTORY__` (manual snapshots) |
| Env | — | `navigator.*`, `__LDS_SESSION_ID__` |

---

## 11. What was changed from ruf-debug-panel

| ruf-debug-panel | lit-debug-suite | Reason |
|----------------|----------------|--------|
| `__RUF_*` globals | `__LDS_*` globals | Generic namespace |
| ACI tab | Events tab (key: `events`) | Generic: not every app has ACI |
| `r.aciTimeline` | `r.eventsTimeline` | Field rename |
| `r.aciFreq` | `r.eventsFreq` | Field rename |
| `entry.falcor` | `entry.decoded` | Decoder is a plugin, not built-in |
| Syndigo context in inspector | `window.__LDS_CONTEXT_GETTER__` hook | Generic hook |
| Hardcoded file path | `window.__LDS_TAG_TO_FILE__` hook | Generic hook |
| `ruf-element.js` Polymer `ready()` path | Removed | Lit-only |
| `_propertiesChanged` | Removed | Polymer-only |
| Falcor decoder inline | `custom/ui-platform/FalcorDecoder.js` | Syndigo-only |
| ACI tracer inline | `custom/ui-platform/AciPlugin.js` | Syndigo-only |
| DataObjectManager patch inline | `custom/ui-platform/SyndigoSlowApiPlugin.js` | Syndigo-only |

---

## 12. Source reference (original files)

All in `D:\Work\R7\generic-changes\ui-platform-elements\src\base\`:

```
ruf-vitals.js         → src/core/vitals.js
ruf-console.js        → src/core/console.js
ruf-network.js        → src/core/network.js + custom/ui-platform/FalcorDecoder.js
ruf-perf.js           → src/core/perf.js
ruf-prop-audit.js     → src/core/prop-audit.js
ruf-error-boundary.js → src/core/error-boundary.js
ruf-cycle-detector.js → src/core/cycle-detector.js
ruf-inspector.js      → src/core/inspector.js
ruf-aci-tracer.js     → src/core/event-tracer.js + custom/ui-platform/AciPlugin.js
ruf-slow-api.js       → src/core/slow-api.js + custom/ui-platform/SyndigoSlowApiPlugin.js
ruf-memory.js         → src/core/memory.js
ruf-debug-panel.js    → src/panel/LdsDebugPanel.js
```

---

## 13. Known limitations / future work

- **React / Angular**: `FrameworkAdapter` base class exists but no concrete impl yet.
  See `src/adapter/FrameworkAdapter.js` for the 6 methods to implement.
- **Extension on chrome:// pages**: Chrome blocks `executeScript` on internal pages —
  the extension silently ignores these (caught in background.js catch block).
- **CSP-locked pages**: Pages with strict CSP that block inline scripts may block
  the panel bundle injection. Nothing to do without a CSP nonce approach.
- **panel.bundle.js not in git**: Must be built before loading the extension.
  Run `npm run build:extension` after cloning.
- **Icons**: Placeholder PNGs required in `extension/icons/` — Chrome rejects the
  extension without them even for unpacked load.
