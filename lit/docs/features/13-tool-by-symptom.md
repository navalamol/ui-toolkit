# Tool by Symptom — which tool to use

Start here if you know the problem but not which tool to reach for.

---

## Performance problems

### "The page feels slow on first load"
**Tool:** [Performance Monitor](01-perf-monitor.md) `__LDS_PERF_ENABLED__`  
**Tab:** Perf  
**What to look for:** Top row in the Perf table — the component with the highest avg ms is the bottleneck. If avg ms > 500, Pinpoint will have a stack trace (attribution-level finding).

### "The page gets slower the longer I use it"
**Tools:**
1. [Memory Counters](12-memory-counters.md) (always on) → **Memory tab** — check if `active` count grows over navigation cycles
2. [Resource Tracker](10-resource-tracker.md) `__LDS_RESOURCE_TRACKER__` → **Pinpoint tab** — check for `lifetime-violation` findings (event listeners not being cleaned up)

### "A component re-renders way more than it should"
**Tool:** [Prop Audit](02-prop-audit.md) `__LDS_PROP_DEBUG__ = 'your-component'`  
**Tab:** None (console + Pinpoint)  
**What to look for:** Console logs showing which prop changes on each render. `sameRef: true` means the component is re-rendering for no real data change.

### "There's jank / frame drops during interaction"
**Tools:**
1. [Web Vitals](07-vitals.md) `__LDS_VITALS_ENABLED__` → **Vitals tab** — check Long Tasks list for script blocks > 50ms
2. [Prop Audit](02-prop-audit.md) → `window.__LDS_THRASH__` — check if a prop is being written many times per second

### "API calls are slow but I don't know which one"
**Tool:** [Slow API Monitor](05-slow-api.md) `__LDS_SLOW_API__`  
**Tab:** SlowAPI  
**What to look for:** Visual badge (`⏱ 823ms`) appears directly on the component that triggered the slow call. SlowAPI tab has the full log.

---

## Memory problems

### "I think elements are not being cleaned up"
**Tool:** [Memory Counters](12-memory-counters.md) (always on)  
**Tab:** Memory  
**What to look for:** `active` count for a tag should return to 0 after navigating away from a page. If it stays positive and grows across navigations: leak.

### "I think event listeners are accumulating"
**Tool:** [Resource Tracker](10-resource-tracker.md) `__LDS_RESOURCE_TRACKER__`  
**Tab:** Pinpoint (no dedicated tab)  
**What to look for:** `lifetime-violation` cards in Pinpoint. Each violation names the component, event type, and target (window/document/self). See the doc for the required workflow (must navigate away to trigger detection).

### "The browser tab's memory usage grows over time"
**Tools (in order):**
1. [Memory Counters](12-memory-counters.md) → Memory tab — `active` count growing? That's the component retaining instances
2. [Resource Tracker](10-resource-tracker.md) → Pinpoint — global listeners (`target: "window"`) are the most impactful leak class
3. [Component Inspector](03-inspector.md) `__LDS_INSPECTOR__` → clipboard — snapshot a suspicious component to see its private state

---

## Network problems

### "I want to see every request this page makes"
**Tool:** [Network Monitor](08-network.md) `__LDS_NETWORK_ENABLED__`  
**Tab:** Network  
**What to look for:** Full request log, filterable by errors / slow / large. Duplicate URLs in the list suggest a component requesting the same data multiple times.

### "Network calls are failing and I don't know which"
**Tool:** [Network Monitor](08-network.md)  
**Tab:** Network → filter "Errors"  
Also check: **Console tab** — `console.error` from failed fetches is captured there.

### "The API seems fine but the component is still slow"
**Tool:** [Slow API Monitor](05-slow-api.md) `__LDS_SLOW_API__`  
Note: Network Monitor measures time-to-response. Slow API Monitor measures time-to-component-render — it catches cases where the data arrives quickly but the component takes a long time to process it.

### "There are too many identical Falcor calls and I can't tell them apart"
**Tool:** [Falcor Tab](15-falcor-tab.md) `__LDS_NETWORK_ENABLED__` + `__LDS_FALCOR_VIEW__`  
**Tab:** Falcor → Grouped view  
**What to look for:** Burst groups — one group = one user action. Within each group, check `dataIndex×count` to see how many calls went to each endpoint, and expand a call to see the entity types, IDs, and fields requested.

### "I think the app is re-fetching the same Falcor data unnecessarily"
**Tool:** [Falcor Tab](15-falcor-tab.md)  
**Tab:** Falcor → analytics footer  
**What to look for:** "N duplicate paths detected" warning. Expand affected calls → paths labelled `DUP` in orange are being requested multiple times. Check whether different components are independently requesting the same entities without a shared cache.

### "A Falcor operation is slow — I want to understand why"
**Tools:**
1. [Falcor Tab](15-falcor-tab.md) → Grouped view — is the slow burst `sequential`? (Calls waited for each other, suggesting a dependent pipeline.) Or `parallel`? (All fired at once — server-side or network latency is the cause.)
2. [Slow API Monitor](05-slow-api.md) → SlowAPI tab — is the slowness in `initiateRequest()` before the XHR fires, or in the XHR itself?

### "I want to understand a search session end-to-end"
**Tool:** [Falcor Tab](15-falcor-tab.md)  
**Tab:** Falcor → Search Sessions view  
**What to look for:** One session per search action. The CALL (searchResults.create) initiates the search; subsequent GETs load each page of results. Compare CALL duration vs GET durations to know whether the bottleneck is search execution or data loading.

---

## Rendering / update problems

### "A component re-renders when nothing should have changed"
**Tool:** [Prop Audit](02-prop-audit.md) `__LDS_PROP_DEBUG__ = 'your-component'`  
**What to look for:** `sameRef: true` in console output means the same array or object reference is being passed as new. Common cause: `this.items.push(x)` instead of `this.items = [...this.items, x]`.

### "I see a render loop / browser hangs on interaction"
**Tool:** [Cycle Detector](09-cycle-detector.md) `__LDS_CYCLE_DETECT__`  
**Tab:** Pinpoint (no dedicated tab)  
**What to look for:** `circular-update` finding with a `path` like `rock-grid → product-tile → rock-grid`. The `count` tells you how many times the cycle fired.

### "I don't know what state a component is in right now"
**Tool:** [Component Inspector](03-inspector.md) `__LDS_INSPECTOR__`  
**Tab:** None (clipboard + console)  
**What to look for:** Hover over the component → click the 📸 badge → clipboard contains all public props and private state as JSON.

---

## Event bus problems

### "I don't know what events are firing during this interaction"
**Tool:** [Event Tracer](04-event-tracer.md) `__LDS_EVENTS_TRACE__`  
**Tab:** Events  
**What to look for:** Timeline table with sequence numbers, timestamps, event names, and which component dispatched each one.

### "An event is firing way too many times"
**Tool:** [Event Tracer](04-event-tracer.md)  
**What to look for:** `window.__LDS_EVENTS_FREQ_REPORT__()` → any event with `🔥 HIGH` (count > 20). Check `sources` to see which component is over-dispatching.

---

## Page health / scoring

### "I want a single health score for this page"
**Tab:** Summary (no flag needed if other tools are enabled)  
The Summary tab shows: Vitals (LCP/CLS/INP), error count, slow API count, memory stats, and a 0–100 page health score.

### "I need to catch regressions across deploys"
**Tool:** [Workflow Baseline](11-workflow-baseline.md) (flag optional)  
**Tab:** Summary → Workflow Baseline section  
Set a baseline after a healthy session. Future sessions show divergence automatically.

---

## Sharing / reporting

### "I want to share this debug session with a teammate"
Panel → **Download JSON** → share the file. They use panel → **Import** to load it.

### "I want Claude Code to fix the issues I found"
Pinpoint tab → **Export Fix Table** → paste `evidenceCapsule.claudePrompt` from the highest-severity finding into Claude Code. See [Pinpoint tab guide](00c-pinpoint-tab.md).
