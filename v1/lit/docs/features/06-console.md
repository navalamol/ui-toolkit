# Console Capture — `__LDS_CONSOLE_ENABLED__`

**Source:** `src/core/console.js`  
**Panel tab:** Console  
**Data globals:** `window.__LDS_CONSOLE__`

---

## What it is

Patches `console.error` and `console.warn` to capture every call into a bounded ring buffer. The original `console.error`/`warn` still fires normally — nothing is suppressed. The panel's Console tab lets you read, filter, and search the captured log even after the DevTools console has been cleared or has scrolled away.

---

## The problem it solves

You have a bug that only appears under specific user workflows. By the time you open DevTools, the relevant console errors have scrolled off or the console was cleared by a page navigation. You ask the user to reproduce it — they can't reliably — and you have no log.

With Console Capture enabled, every `console.error` and `console.warn` from the start of the session is preserved in `window.__LDS_CONSOLE__`, regardless of what the DevTools console shows. The panel's Console tab lets you read the history at any time, and exported JSON reports include it.

---

## How to enable

```js
// Standalone
window.__LDS_CONSOLE_ENABLED__ = true;

// Or via master flag
window.__LDS_DEBUG__ = { console: true };
```

The patch is session-global. It is applied once (on the first `attach(el)` call from any element), and subsequent `attach()` calls are no-ops. It is **not reversible** per session — once patched, `console.error` and `console.warn` remain wrapped until page reload.

Must be set before errors occur that you want to capture, or before page load for a clean session.

---

## How it works

On first `attach()`, the module replaces `console.error` and `console.warn` with wrappers that:
1. Call `_push(level, args)` to append to the ring buffer
2. Call the original function (`_origError(...args)` / `_origWarn(...args)`) so the console still shows the message normally

```js
// Simplified from source
console.error = (...args) => {
  _push('error', args);   // capture
  _origError(...args);    // still shows in DevTools
};
```

`_push(level, args)` serializes each argument to a string: strings are used as-is, other types are JSON.stringify'd (with a String fallback). Arguments are space-joined into a single `message` string.

When the buffer reaches 200 entries, the oldest entry is dropped (`_log.shift()`).

---

## The data shape

```js
window.__LDS_CONSOLE__
// [{ level, message, ts }]
// Capped at 200 entries.

window.__LDS_CONSOLE__[0]
// {
//   level:   "error",
//   message: "Uncaught TypeError: Cannot read properties of undefined (reading 'id') at rock-grid.js:184",
//   ts:      "2026-10-06T10:14:32.110Z"
// }

window.__LDS_CONSOLE__[1]
// {
//   level:   "warn",
//   message: "[LdsMemory] lifetime-violation: <rock-grid> (instance #3) disconnected with 3 unreleased resource(s)",
//   ts:      "2026-10-06T10:14:33.500Z"
// }
```

---

## Console commands

```js
// Read the buffer directly
window.__LDS_CONSOLE__

// Clear the buffer (does not affect DevTools console)
window.__LDS_CONSOLE_CLEAR__()
// [LdsConsole] Buffer cleared
```

---

## Panel tab: Console

The Console tab shows entries in reverse-chronological order (newest first). Controls:

- **Level filter** — `all` / `error` / `warn`
- **Search** — filters by message substring
- **Copy** — copies filtered entries as JSON

The panel's Reports → Download JSON also includes the Console buffer in the full report snapshot.

---

## Reliability

**High:** `console.error` and `console.warn` calls are synchronous. Every call that runs through the patched function is captured. There are no race conditions or missed calls.

**Note:** `console.error` called before the first `attach()` call (i.e., before any element mounts with the mixin) is not captured. Set `window.__LDS_CONSOLE_ENABLED__ = true` before page load to capture errors from module initialization.

**Note:** The message serialization is simple — `JSON.stringify` with a String fallback. Complex objects (circular references, DOM nodes, deeply nested structures) serialize as `"[object Object]"` or truncated JSON. The original call to `_origError` still receives the full object, so the DevTools console shows it correctly. The buffer's `message` string is a text summary, not a structured copy.

---

## Limitations

**`console.log` is not captured.** Only `error` and `warn`. `console.log` calls — even from `window.__LDS_*` tools — are not in the buffer.

**Message is a flat string, not structured.** If you pass `console.error('Failed:', errorObject)`, the buffer contains `"Failed: {\"code\":500,...}"`. You lose access to the error object itself — you can't inspect it programmatically from the buffer.

**Not reversible mid-session.** Once the console is patched, it stays patched. There is no `detach()` path for this tool.

**200-entry cap.** On pages with frequent warnings (framework deprecation notices, noisy third-party libraries), the buffer fills quickly and older entries are lost. In these environments, set `__LDS_SUPPRESS_EVENTS__` (for LDS tools) but also consider filtering noisy warning sources before enabling this tool broadly.

**No stack traces.** The captured `message` is the formatted string. The stack trace that DevTools shows for `console.error` calls is not stored. You get the message text only.

---

## What can improve

1. **`console.log` capture as optional.** A `window.__LDS_CONSOLE_LEVELS__ = ['error', 'warn', 'log']` opt-in.
2. **Structured message storage.** Store serialized arguments as an array rather than a joined string, so the buffer is queryable by argument type.
3. **Stack traces.** Capture `new Error().stack` inside the wrapper to preserve origin location for each console call.
4. **Configurable buffer size.** `window.__LDS_CONSOLE_MAX__ = 500` for high-traffic error pages.
5. **Filter before capture.** A `window.__LDS_CONSOLE_IGNORE__ = [/\[LdsVitals\]/, 'DeprecationWarning']` option to prevent noise from filling the buffer.

---

## How it makes life easier

- **Never lose a console error.** Regardless of navigation, refresh-without-debug, or the user clearing DevTools, the buffer persists for the session.
- **Session export includes console.** The downloaded JSON report includes `console: [...]`. When a user reports a bug and sends you their exported report, you see exactly what errors appeared in their session, in order.
- **Pair with Error Boundary.** The Errors tab captures structured crash reports from `LdsErrorBoundary`. The Console tab captures everything else — warnings from Lit, deprecation notices, network errors that don't throw — filling the gaps.

---

## What you'll see in the Console tab

The Console tab shows captured messages in reverse-chronological order (newest first):

```
[10:15:01] ERROR  Uncaught promise rejection: fetch failed
[10:14:33] WARN   [LdsMemory] lifetime-violation: <rock-grid> (instance #3)...
[10:14:32] ERROR  TypeError: Cannot read properties of undefined (reading 'id')
```

Controls:
- **Level filter** — All / Error / Warn — use "Error" to see only errors
- **Search** — filter by message text substring
- **Copy** — copies the filtered list as JSON

Note: `console.log` calls are **not** captured — only `console.error` and `console.warn`.

---

## Reading the results

| What you see | What it means |
|---|---|
| Errors from `[LdsMemory]` / `[LdsPerfMonitor]` | Internal tool warnings — these are signals, not bugs in your app |
| TypeError / Cannot read property errors | Real runtime errors — cross-reference with the component on screen when it happened |
| A flood of framework deprecation warnings | Third-party noise — use `window.__LDS_CONSOLE_IGNORE__` (future feature) or filter by search |
| Messages visible in console but not in panel | They happened before the flag was set — reload with the flag active |

---

## Step-by-step: I need to capture console errors from a specific user workflow

1. `window.__LDS_CONSOLE_ENABLED__ = true` → **reload the page** (to capture errors from early initialization)
2. Execute the workflow that triggers the errors
3. Open panel → **Console tab** → filter to "Error"
4. If you need to share: panel → **Download JSON** → the `console` section of the report includes the full buffer

## Step-by-step: getting a user's console errors remotely

1. Ask the user to paste `window.__LDS_CONSOLE_ENABLED__ = true` in their DevTools console
2. They reload and reproduce the issue
3. They click panel → **Download JSON** and send you the file
4. You open panel → **Import** → read their `console` section

---

## Sanity check

```js
// Confirm the buffer is active and capturing:
window.__LDS_CONSOLE__.length   // 0 after page interaction → flag set after errors occurred → reload

// Force a test capture:
console.error('test error');
window.__LDS_CONSOLE__.slice(-1)
// Should show: [{ level: "error", message: "test error", ts: "..." }]
```

---

## Complete example

```js
// 1. Enable before page load
window.__LDS_CONSOLE_ENABLED__ = true;

// 2. Use the app — navigate, trigger errors

// 3. Read the buffer after a bug occurs
window.__LDS_CONSOLE__
  .filter(e => e.level === 'error')
  .map(e => `${e.ts} — ${e.message}`)
// [
//   "2026-10-06T10:14:32.110Z — TypeError: Cannot read properties of undefined...",
//   "2026-10-06T10:15:01.240Z — Uncaught promise rejection: fetch failed"
// ]

// 4. Or open the panel → Console tab → filter by "error" + search "rock-grid"
```
