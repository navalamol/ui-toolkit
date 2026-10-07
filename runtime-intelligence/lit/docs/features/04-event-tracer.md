# Event Tracer — `__LDS_EVENTS_TRACE__`

**Source:** `src/core/event-tracer.js`  
**Panel tab:** Events  
**Data globals:** `window.__LDS_EVENTS_TIMELINE__`, `window.__LDS_EVENTS_FREQ__`

---

## What it is

Records every dispatch through your app's custom event bus — the sequence, timing, event names, payload summaries, and which component triggered each one. Also maintains a frequency table showing which events fire most often and from which components.

**Important:** This tool traces **custom dispatch calls** wired via `LdsEventTracer.patchDispatch()`, not native DOM `dispatchEvent()`. It is designed for apps with a central event bus or action dispatcher (Flux/Redux-style, ACI, custom pub/sub).

---

## The problem it solves

A user action triggers a sequence of events. Something at step 4 behaves unexpectedly. Without tooling, you add `console.log` at each event handler and try to reconstruct the sequence from a flood of logs — no timing, no origin, no order guarantee.

The Event Tracer gives you a timestamped, sequential log of every event name, its payload summary, where it came from (which component file triggered it), and how long after page load it fired.

The frequency table (`R2-C`) answers "which event fires most often?" — useful for spotting event storms where a single user action triggers 30 dispatches that all update the same data.

---

## How to enable

```js
// Enable event recording
window.__LDS_EVENTS_TRACE__ = true;

// Optional: verbose mode — every event also logs to console immediately
window.__LDS_EVENTS_VERBOSE__ = true;

// Optional: filter timeline display by event name substring
window.__LDS_EVENTS_FILTER__ = 'product';   // only show events containing "product"
window.__LDS_EVENTS_FILTER__ = '';           // show all
```

The flag can be toggled live. Events dispatched while the flag is false are not recorded.

### Wiring your event bus (one-time setup)

```js
// Generic — works with any dispatch function
LdsEventTracer.patchDispatch(wrap => {
  myBus.dispatch = wrap(myBus.dispatch.bind(myBus));
});

// Or for a Flux-style store
LdsEventTracer.patchDispatch(wrap => {
  const origDispatch = store.dispatch.bind(store);
  store.dispatch = wrap(origDispatch);
});
```

Once wired, `LdsEventTracer.patchDispatch()` is a no-op on subsequent calls (idempotent via `_patched` guard). The Syndigo integration (`custom/ui-platform/AciPlugin.js`) calls this automatically for `aci.dispatch`.

---

## How it works

`_recordEvent(name, detail)` is called by the dispatch wrapper. It builds a timeline entry and appends it. The entry's `from` field is derived by walking the `Error.stack` to find the first frame that looks like a custom element filename (kebab-case, at least one hyphen, `.js` extension). This is a heuristic — it can be wrong if the stack contains custom element filenames from unrelated code, but it is usually accurate.

The frequency table (`window.__LDS_EVENTS_FREQ__`) is updated inline: `freq[name].count++` and `freq[name].sources` (array of component file names, capped at 15 entries).

Flags a high-frequency event with `🔥 HIGH` in the frequency report when `count > 20`.

---

## The data shape

```js
// Timeline — array of up to 500 entries (ring buffer, oldest dropped)
window.__LDS_EVENTS_TIMELINE__
// [
//   {
//     seq:           1,                  // sequence number, monotonically increasing
//     ts:            "10:14:32.110",     // HH:MM:SS.mmm
//     elapsed:       1240,               // ms since tracer init
//     name:          "product/select",   // event/action name
//     from:          "product-tile",     // component name (from stack heuristic)
//     detail:        { id: "PRD-123" },  // raw payload (reference, not copy)
//     detailSummary: '{"id":"PRD-123"}', // truncated to 120 chars
//   },
//   ...
// ]

// Frequency table
window.__LDS_EVENTS_FREQ__
// {
//   "product/select":  { count: 48, sources: ["product-tile", "search-results"] },
//   "filter/apply":    { count: 12, sources: ["product-filter"] },
//   "nav/route-change":{ count: 3,  sources: ["nav-header"] }
// }
```

---

## Console commands

```js
// Print timeline as console.table (respects __LDS_EVENTS_FILTER__)
window.__LDS_EVENTS_REPORT__()

// Print frequency table sorted by count
window.__LDS_EVENTS_FREQ_REPORT__()
// Events with count > 20 get a 🔥 HIGH flag

// Clear timeline and frequency table
window.__LDS_EVENTS_CLEAR__()

// Record an event manually (useful for testing the wiring)
LdsEventTracer.recordEvent('debug/test', { foo: 'bar' })
```

---

## Reliability

**High:** Sequence number (`seq`) and elapsed timing are reliable — derived from `performance.now()`.

**Medium:** `from` (which component dispatched the event) is a heuristic based on stack frame filenames. It works well for components in kebab-case-named files. It fails when:
- The dispatch happens from a utility module not named after a component
- The stack is minified in production (this tool is for development only)
- The event is dispatched from a third-party library

**Note:** `detail` is a reference, not a copy. If the payload object is mutated after dispatch, the value in `__LDS_EVENTS_TIMELINE__` will reflect the mutation.

---

## Limitations

**Custom event bus only.** Native DOM `dispatchEvent()`, `CustomEvent`, `EventTarget.dispatchEvent` are not intercepted. Only dispatches through the wired bus function are recorded.

**One bus per `patchDispatch()` call.** If your app has multiple buses, each needs its own `patchDispatch()` call. The `_patched` guard prevents double-patching the same invocation but doesn't prevent wiring a second bus separately.

**No panel detail expansion.** The Events tab in the panel shows the timeline table. You cannot expand an individual event to see its full payload (only the 120-char summary is shown). Full payload is in `window.__LDS_EVENTS_TIMELINE__[n].detail` in the console.

**500-entry ring buffer.** On event-heavy pages, old events are dropped. If you need to capture a full session, read `window.__LDS_EVENTS_TIMELINE__` periodically and save it externally.

**`from` only identifies file name, not method.** You know `product-tile` dispatched an event but not which method of `product-tile` triggered it. The full stack is not stored (only the heuristic parse result).

---

## What can improve

1. **Expandable payload in the panel.** Clicking a row in the Events tab should show the full `detail` object.
2. **Event call-chain linking.** If event A causes event B within the same tick, link them as parent/child in the timeline.
3. **DOM event support.** Optional tracing of native `CustomEvent` dispatches, not just the custom bus.
4. **Full stack stored per entry.** Currently only the heuristic `from` is stored. Storing the full stack (trimmed) would let you identify the exact method.
5. **Replay.** Re-dispatch events from the timeline to reproduce a sequence programmatically.

---

## How it makes life easier

- **Sequence is clear.** Events are numbered `seq: 1, 2, 3...` so you can reconstruct the exact order of dispatches in a complex interaction.
- **Timing included.** `elapsed` tells you how long after page load each event fired — immediately visible if something is being deferred longer than expected.
- **Event storms are obvious.** `window.__LDS_EVENTS_FREQ_REPORT__()` shows `product/select: count 48 🔥 HIGH` — one interaction should dispatch this once.
- **No wiring to individual handlers.** You instrument the bus once; every dispatch is captured automatically.

---

## What you'll see in the Events tab

The Events tab shows the timeline table (most recent first by default):

```
┌───┬──────────────┬────────────────────┬──────────────┬────────────────┐
│ # │ elapsed ms   │ event              │ from         │ detail         │
├───┼──────────────┼────────────────────┼──────────────┼────────────────┤
│ 1 │ 1240         │ product/select     │ product-tile │ {"id":"PRD-1"} │
│ 2 │ 1241         │ cart/add           │ rock-grid    │ {"qty":1}      │
│ 3 │ 1242         │ analytics/track    │ rock-grid    │ {"event":"add"}│
│ 4 │ 1310         │ analytics/track    │ rock-grid    │ {"event":"add"}│ ← duplicate?
└───┴──────────────┴────────────────────┴──────────────┴────────────────┘
```

- **seq** (`#`) — the absolute order of dispatch; if this resets to 1, the tracer was cleared
- **elapsed ms** — time since tracer init; use this to spot deferred events
- **from** — heuristic: which component file dispatched the event (may be wrong for utility modules)
- **detail** — truncated to 120 chars; for the full payload: `window.__LDS_EVENTS_TIMELINE__[n].detail`

The **Events tab** also has a frequency table below the timeline, showing which event names appear most and from which components.

---

## Reading the results

| What you see | What it means |
|---|---|
| Same event name repeating many times | Possible event storm — check the frequency table for `🔥 HIGH` |
| Very close elapsed timestamps (1–2ms apart) | Events firing synchronously in the same tick — a chain reaction |
| Large elapsed gap before an event | Something is deferring that dispatch (setTimeout, async await) |
| `from: null` | The event was dispatched from a utility module or async context |
| Duplicate entries with same detail | One user action is dispatching the event multiple times |

---

## Step-by-step: I don't know what's happening during this interaction

1. Wire your event bus (one-time setup — see "How to enable" above)
2. `window.__LDS_EVENTS_TRACE__ = true` (no reload needed)
3. Perform the interaction you want to trace
4. Open panel → **Events tab** — read the sequence top to bottom
5. Look for unexpected event names, duplicates, or large elapsed gaps
6. `window.__LDS_EVENTS_FREQ_REPORT__()` — shows which events fire most; `🔥 HIGH` means > 20 dispatches

## Step-by-step: an event is firing too many times

1. `window.__LDS_EVENTS_FREQ_REPORT__()` — identify the high-count event name
2. `window.__LDS_EVENTS_FILTER__ = 'event-name'` — filter the timeline to just that event
3. `window.__LDS_EVENTS_REPORT__()` — see every dispatch: elapsed times reveal if it's batched or spread out
4. Check the `from` field — is the same component dispatching it repeatedly?
5. Filter to that component: `window.__LDS_PROP_DEBUG__ = 'that-component'` to see what's triggering its renders

---

## Sanity check

```js
// Confirm the bus is wired and recording:
LdsEventTracer.recordEvent('debug/test', { test: true });
window.__LDS_EVENTS_TIMELINE__.slice(-1)
// Should show your test event. If not: flag not set, or bus not wired.

// Check frequency table:
window.__LDS_EVENTS_FREQ__   // {} means no events recorded yet
```

---

## Complete example

```js
// 1. Wire your bus (once, in your app startup or debug script)
LdsEventTracer.patchDispatch(wrap => {
  window.__myBus__.dispatch = wrap(window.__myBus__.dispatch.bind(window.__myBus__));
});

// 2. Enable recording
window.__LDS_EVENTS_TRACE__ = true;

// 3. Use the app — click a product, apply a filter, navigate

// 4. Check the timeline
window.__LDS_EVENTS_REPORT__()
// ┌───┬──────────────┬────────────────────┬──────────────┬────────────────┐
// │ # │ elapsed ms   │ event              │ from         │ detail         │
// ├───┼──────────────┼────────────────────┼──────────────┼────────────────┤
// │ 1 │ 1240         │ product/select     │ product-tile │ {"id":"PRD-1"} │
// │ 2 │ 1241         │ cart/add           │ rock-grid    │ {"qty":1}      │
// │ 3 │ 1242         │ analytics/track    │ rock-grid    │ {"event":"add"}│
// │ 4 │ 1310         │ analytics/track    │ rock-grid    │ {"event":"add"}│  ← duplicate?
// └───┴──────────────┴────────────────────┴──────────────┴────────────────┘

// 5. Check frequency
window.__LDS_EVENTS_FREQ_REPORT__()
// analytics/track: count 24 🔥 HIGH — firing on every keypress?
```
