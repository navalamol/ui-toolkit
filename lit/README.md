# lit-debug-suite

Zero-overhead debug suite for any LitElement application. Drop-in mixin that activates 12 diagnostic tools only when `window.__LDS_DEBUG__` is truthy.

Extracted from the Syndigo `ruf-debug-panel` — all Syndigo-specific code (Falcor, ACI, DataObjectManager) lives in `custom/ui-platform/` only.

---

## Installation

```bash
npm install lit-debug-suite
```

---

## Quick start

```js
// In your LitElement base class:
import { LitDebugMixin } from 'lit-debug-suite';
import { LitElement } from 'lit';

class MyBase extends LitDebugMixin(LitElement) {}

// Activate in DevTools console or via app config:
window.__LDS_DEBUG__ = true;                          // all tools
window.__LDS_DEBUG__ = { perf: true, network: true }; // selective
```

Add the panel to your page (or let the Chrome extension inject it):

```html
<script type="module">
  import 'lit-debug-suite/panel';
</script>
<lds-debug-panel></lds-debug-panel>
```

---

## Tools

| Tool key        | Window global                              | What it tracks |
|----------------|---------------------------------------------|---------------|
| `vitals`        | `__LDS_VITALS__`                           | LCP, CLS, INP, Long Tasks |
| `network`       | `__LDS_NETWORK_LOG__`                      | fetch + XHR with decoded payloads |
| `perf`          | `__LDS_PERF__`, `__LDS_SLOW_RENDERS__`     | TTI per component, slow render incidents |
| `propAudit`     | `__LDS_RENDER_REASONS__`, `__LDS_THRASH__` | render reasons (R2-A), property thrash (R2-B) |
| `inspector`     | `__LDS_INSPECTOR__`                        | hover badge overlay, prop snapshot |
| `cycleDetector` | `__LDS_CYCLES__`                           | circular update chain detection |
| `eventTracer`   | `__LDS_EVENTS_TIMELINE__`, `__LDS_EVENTS_FREQ__` | custom event frequency |
| `slowApi`       | `__LDS_SLOW_API_LOG__`                     | API calls over threshold |
| `console`       | `__LDS_CONSOLE__`                          | console.error / .warn ring buffer |
| `memory`        | `__LDS_MEMORY__`, `__LDS_STORMS__`         | mount/unmount/GC tracking |
| `errorBoundary` | `__LDS_ERRORS__`                           | render crash capture (always-on) |

---

## Selective enablement

```js
// Enable only perf and network — no overhead from other tools
window.__LDS_DEBUG__ = { perf: true, network: true };
```

Or via app config before first element mount:
```js
window.__LDS_APP_CONFIG__ = { debugEnabled: true };
```

---

## Packages

### `lit-debug-suite` (main)
Generic core — zero Syndigo dependencies.

### `lit-debug-suite/panel`
```js
import 'lit-debug-suite/panel';
// registers <lds-debug-panel> custom element
```

### `lit-debug-suite/custom/ui-platform`
Syndigo-specific plugins. Import once in your app entry:
```js
import 'lit-debug-suite/custom/ui-platform';
// - Registers Falcor decoder for network requests
// - Patches window.__dataObjectManager__ for slow API tracking
// - Installs __RUF_* → __LDS_* compatibility aliases
```

For per-element ACI tracing:
```js
import { attachToElement } from 'lit-debug-suite/custom/ui-platform';
// In element connectedCallback:
attachToElement(this); // wraps this.aci.dispatch
```

---

## Chrome Extension

Located in `extension/`. Manifest V3.

**One-time setup:**
```bash
cd lit/
npm install
npm run build:extension        # → writes extension/panel.bundle.js
# Add placeholder PNGs to extension/icons/ (icon16.png, icon48.png, icon128.png)
# chrome://extensions → Developer mode ON → Load unpacked → select extension/
```

**Usage:**
Click the **LDS Debug Panel** toolbar icon on any page to toggle the floating panel on/off.

**How injection works — why MAIN world matters:**
Chrome extensions run content scripts in an "isolated world" — a separate JS realm that
shares the DOM but has its own `customElements` registry. Defining `<lds-debug-panel>`
in the isolated world makes it invisible to the page. The extension therefore injects
`panel.bundle.js` using `chrome.scripting.executeScript({ world: 'MAIN' })` so the
element is registered in the page's own realm and `document.createElement('lds-debug-panel')`
works correctly.

**What works without any app changes:**
| Tab | Needs mixin? |
|-----|-------------|
| Vitals | No — PerformanceObserver |
| Network | No — patches fetch/XHR globally |
| Console | No — patches console.error/warn |
| Env | No |
| All other tabs | Yes — requires LitDebugMixin in element base class |

**Toggle from DevTools console:**
```js
window.__LDS_DEBUG__ = true;   // enable (and set by the extension automatically)
window.__LDS_DEBUG__ = false;  // disable
```

---

## FrameworkAdapter

Implement `FrameworkAdapter` for React/Angular support:

```js
import { FrameworkAdapter } from 'lit-debug-suite';

class ReactAdapter extends FrameworkAdapter {
    isManaged(el) { /* check for React fiber */ }
    wrapRenderCycle(el, onBefore, onAfter) { /* useEffect wrap */ }
    // ... implement remaining 4 methods
}
```

---

## Global configuration hooks

| Global | Purpose |
|--------|---------|
| `window.__LDS_DEBUG__` | `true` / `false` / `{ toolKey: bool }` — master gate |
| `window.__LDS_APP_CONFIG__` | `{ debugEnabled: bool }` — app config fallback |
| `window.__LDS_CRASH_ENDPOINT__` | URL to POST crash reports to |
| `window.__LDS_CRASH_AUTO_POST__` | `true` to enable auto-POST |
| `window.__LDS_CONTEXT_GETTER__(el)` | Function returning context object for inspector snapshot |
| `window.__LDS_TAG_TO_FILE__(tag)` | Function mapping element tag → source file path |
| `window.__LDS_EVENTS_TRACE__` | `true` to enable event timeline recording |
| `window.__LDS_EVENTS_FILTER__` | Array of event names to trace (all if unset) |
| `window.__LDS_PROP_DEBUG__` | `"<tag-name>"` to enable per-prop console logging for that element |
| `window.__LDS_SLOW_API_MS__` | Slow API threshold in ms (default 1000) |
| `window.__LDS_THRASH_THRESHOLD__` | Prop set count/sec before thrash alert (default 5) |
| `window.__LDS_STACK_FILTER_RE__` | RegExp for stack frame app-only filtering |

---

## Directory structure

```
lit-debug-suite/
  src/
    core/           — 12 tools: gate, memory, perf, error-boundary, prop-audit,
                      inspector, cycle-detector, event-tracer, slow-api,
                      console, vitals, network
    adapter/
      FrameworkAdapter.js    — abstract base
      lit/LitAdapter.js      — Lit 3 implementation
    panel/
      LdsDebugPanel.js       — full 12-tab debug panel (<lds-debug-panel>)
    LitDebugMixin.js         — drop-in mixin
    index.js                 — barrel export
  custom/
    ui-platform/
      FalcorDecoder.js       — Falcor protocol decoder
      AciPlugin.js           — ACI dispatch tracer
      SyndigoSlowApiPlugin.js — DataObjectManager wrapper
      compat.js              — __RUF_* → __LDS_* aliases
      index.js               — registers all Syndigo plugins
  extension/
    manifest.json            — Chrome MV3 manifest
    background.js            — service worker: injects panel.bundle.js into MAIN world
    content.js               — isolated world; handles app-set __LDS_DEBUG__ only
    panel-host.js            — dev-only reference (not used by extension)
    panel.bundle.js          — GENERATED by npm run build:extension (not in git)
```

---

## Future: React adapter

```
src/adapter/react/ReactAdapter.js  — implement 6 methods using hooks
src/ReactDebugWrapper.jsx          — HOC wrapping using ReactAdapter
```

---

## License
MIT
