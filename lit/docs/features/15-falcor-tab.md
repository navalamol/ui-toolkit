# Falcor Tab — Falcor Network Toolkit

**Source:** `custom/ui-platform/FalcorDecoder.js` + `custom/ui-platform/FalcorNetworkEnhancer.js`  
**Panel tab:** Falcor  
**Prerequisite flag:** `window.__LDS_NETWORK_ENABLED__ = true` (provides the data)  
**Tab visibility flag:** `window.__LDS_FALCOR_VIEW__ = true`  
**Data source:** `window.__LDS_NETWORK_LOG__` filtered to `decoded.protocol === 'falcor'`

> **Syndigo-specific.** This tab is part of `custom/ui-platform/` — not the generic lit-debug-suite core. It requires `FalcorDecoder` to be registered with `LdsNetwork` (done automatically by `custom/ui-platform/index.js`).

---

## The problem it solves

The Network tab shows Falcor calls as rows with identical-looking names:

```
POST  /data/entityData.json      423ms
POST  /data/entityData.json      389ms
POST  /data/entityData.json      211ms
POST  /data/entityGovernData.json 180ms
…
```

These tell you nothing useful: you can't see which entity types or IDs were requested, why there are 10 `entityData` calls, whether they're related to the same user action, or whether any data is being re-fetched unnecessarily.

The Falcor tab decodes the POST body of every Falcor call, groups related calls, and surfaces the path anatomy — the actual entity types, entity IDs, and fields being requested.

---

## Why there are so many Falcor calls

Falcor's architecture at Syndigo generates multiple XHRs for a single user action:

**One XHR per dataIndex:** Each data domain has its own endpoint (`/data/entityData.json`, `/data/entityGovernData.json`, `/data/configData.json`, etc.). A component load that needs entity data + governance data + config data = minimum 3 XHRs.

**Multiple XHRs per dataIndex:** The bolt pipeline (`GetByIdsBolt`) may fire several sequential `FalcorManager.get()` calls for a single data request — prelim field keys, relationship IDs, main data, chunks — each becomes its own XHR.

**ImmediateScheduler:** Falcor uses synchronous flushing by default. XHRs fire in the same call stack as `FalcorManager.get()`, so a single component connect can trigger a burst of 5–15 calls within milliseconds of each other.

**Result in the Network tab:** 10+ identical POST calls with no visible relationship, no path details, no grouping.

---

## How to enable

Both flags must be set **before** the page loads data:

```js
// Step 1 — enable network monitoring (captures XHR/fetch)
window.__LDS_NETWORK_ENABLED__ = true;

// Step 2 — enable Falcor tab visibility
window.__LDS_FALCOR_VIEW__ = true;

// Then reload — the XHR patch must be installed before Falcor calls fire
```

After reload: navigate to an entity detail page or search page. Open 🐞 panel → **Falcor** tab.

**Minimum required:** only `__LDS_NETWORK_ENABLED__` is needed for data. `__LDS_FALCOR_VIEW__` controls tab visibility. If you don't set it, the Falcor tab still appears (current behaviour matches how the other pre-existing gate flags work).

---

## The three views

### Grouped view (default)

Groups calls that fired within 200ms of each other into "bursts". One burst = one user action / one component load.

```
Burst 1  847ms total  entityData×3 · entityGovernData×2  12 IDs  parallel  ▼
Burst 2  2340ms total  entityData×1  48 IDs  sequential  ▲
  └─ GET  entityData  2340ms  +0ms  48 IDs  ⚠ 1 dup  [sku]
       Entity IDs (48): id1, id2, id3, … +45 more
       Fields (3): id  name  attributes  [name 4×]  [attributes 3×]
       3 paths:  DUP on path [...]
```

**Burst header fields:**

| Field | Meaning |
|---|---|
| `Burst N` | Sequential number, newest first |
| `Nms total` | Sum of all call durations in the burst (green < 800ms, amber < 2000ms, red ≥ 2000ms) |
| `dataIndex×count` | How many calls per endpoint — `entityData×3` means 3 calls to `/data/entityData.json` |
| `N IDs` | Total unique entity IDs across all calls in the burst |
| `parallel` | All calls started within 100ms of each other — fired concurrently |
| `sequential` | Calls spread out > 100ms — later calls waited for earlier ones to complete |
| `⚠ N dup paths` | N paths in this burst were also seen in other bursts — same data requested again |

**Call row fields:**

| Field | Meaning |
|---|---|
| `GET` / `POST` / `CALL` | Falcor method (`get`, `set`, or `call`) |
| `entityData` | DataIndex — the endpoint basename |
| `423ms` | Duration in ms (green ≤ 500ms, amber ≤ 1000ms, red > 1000ms) |
| `+45ms` | Offset from burst start — shows sequencing within the burst |
| `15p` | Number of paths in this call |
| `12 IDs` | Number of entity IDs in this call |
| `⚠ 2 dups` | 2 paths in this call were also sent in other calls (potential cache miss) |
| `[sku] [product]` | Entity type pills |
| `48 KB` | Response size |

### By DataIndex view

Groups all calls across the session by their endpoint, sorted by call count descending.

```
entityData      14 calls  · 187 paths · 34 unique IDs  · 4823ms  ▼
entityGovernData  6 calls  · 48 paths  · 34 unique IDs  · 1204ms  ▼
configData        2 calls  · 6 paths   · 2 unique IDs   · 145ms   ▼
```

Use this view to understand the total cost of each data domain across the full session.

### Search Sessions view

Links `searchResults.create` CALL entries to their subsequent paginated GET entries. Requires actual search interaction to produce data.

```
Search 1  requestId: abc123…  3 pages  890ms total  ▼
  └─ CALL  entityData  180ms  — searchResults.create
  └─ GET   entityData  250ms  — page 0 results
  └─ GET   entityData  460ms  — page 1 results
```

The server returns a `requestId` in the CALL response. Subsequent paginated GETs embed this `requestId` as a path key — that's how sessions are linked.

---

## The decoded shape

Every Falcor entry in `window.__LDS_NETWORK_LOG__` where `decoded.protocol === 'falcor'` has:

```js
entry.decoded
// {
//   protocol:        "falcor",
//   method:          "get",          // "get" | "set" | "call"
//   callPath:        "generic.sku.byIds.id1.id",  // first path joined (display only)
//   callPathArr:     ["generic","sku","byIds","id1","id"],
//   types:           ["generic"],    // first segment of each path (legacy field)
//   args:            null,           // CALL args only
//   domain:          "Entity Get",   // mapped from root key
//   appName:         null,
//   operation:       "GET  generic.sku...",
//
//   // Extended fields (Phase 11):
//   dataIndex:       "entityData",   // from URL: /data/entityData.json
//   paths:           [[...], [...]], // full parsed paths array
//   pathCount:       15,             // number of path arrays in this POST
//   isBatchGet:      true,           // pathCount > 1
//   entityTypes:     ["sku"],        // string just before "byIds" in each path
//   entityIds:       ["id1","id2"],  // values inside byIds[] key-sets
//   fields:          ["id","name","attributes"],  // leaf segments after entity IDs
//   isSearch:        false,          // true if path contains "searchResults"
//   searchRequestId: null,           // requestId from search session pagination
// }
```

---

## Session analytics (bottom of tab)

Always visible regardless of active view.

**Entity types:** Each unique entity type seen across all Falcor calls, with a call count. High counts reveal which entity types are being fetched most.

**Top fields:** The 10 most requested fields across all calls, with frequency. `attributes 54×` means `attributes` appeared in 54 paths across the session.

**Duplicate paths:**
- **Green: "No duplicate paths"** — every path request was unique. Clean.
- **Amber: "N duplicate paths detected — same data requested in multiple separate calls. Consider batching."** — the same Falcor path was sent in more than one XHR. This is a cache miss: Falcor didn't return the data from its local model cache and issued a new network request. Common causes: multiple components independently requesting the same entity, or paths not collapsing correctly because of key-set mismatch.

---

## Filters

**DataIndex dropdown:** Narrows to calls for one endpoint. Useful when you want to focus on `entityGovernData` performance in isolation.

**Path search box:** Free-text match against `dataIndex`, `entityTypes`, `fields`, and `entityIds`. Examples:
```
sku           → only calls that requested sku entity types
attributes    → only calls that requested the attributes field
id1           → only calls that fetched entity "id1"
entityData    → only entityData endpoint calls
```

---

## Step-by-step: understanding why a page makes so many calls

1. `window.__LDS_NETWORK_ENABLED__ = true` → reload
2. Navigate to the entity page in question
3. Open panel → **Falcor tab** → **Grouped** view
4. Count burst groups: **one burst per user action** (initial load = burst 1, modal open = burst 2, etc.)
5. For the main load burst: expand it → how many calls? Check `parallel` vs `sequential`
6. If `sequential`: calls waited for each other — investigate whether the bolt pipeline could be parallelised
7. Check the `dataIndex×count` breakdown: `entityData×6` suggests the data was split into 6 separate requests. This is often expected (prelim keys, relationship IDs, main data, chunks) but worth verifying

---

## Step-by-step: finding duplicate data requests

1. Check the header stats bar for `N dup paths`
2. If dupes exist: expand calls in the Grouped view and look for `⚠ N dups` on call rows
3. Expand the call → look for **DUP** labels on individual paths (shown in orange)
4. For each duplicate: note which two burst groups contain it — are they from the same component mounting twice? Different components requesting the same data independently?
5. The analytics footer shows which entity IDs are fetched most frequently (hot entities)

---

## Step-by-step: investigating a slow Falcor operation

1. Open Grouped view — bursts are sorted newest-first; look for red duration values
2. Expand the slow burst → check if the slowness is in one call (`sequential` burst where one call's duration explains the total) or spread across many (`parallel` burst where total ≈ longest individual call)
3. Expand the slow call → check `paths` count and entity ID count
   - High path count (30+) with many entity IDs (20+): expected for large list pages
   - Low path count (1–3) but still slow: network latency or server-side issue, not a batching problem
4. For very slow search calls: switch to **Search Sessions** view — check if the initiate CALL is slow or the paginated GETs are slow (different causes)

---

## Step-by-step: investigating a search session

1. Run a search in the application
2. Open panel → **Falcor tab** → **Search Sessions** view
3. Each session shows: the `searchResults.create` CALL + all paginated GETs linked by `requestId`
4. If `requestId` shows as empty: the CALL's response didn't return a parseable requestId — check the raw paths in the call expansion
5. Compare durations: slow CALL = server-side search latency; slow GETs = data loading per page

---

## Console commands

```js
// All Falcor entries in the network log
window.__LDS_NETWORK_LOG__.filter(n => n.decoded?.protocol === 'falcor')

// Grouped by dataIndex
window.__LDS_NETWORK_LOG__
  .filter(n => n.decoded?.protocol === 'falcor')
  .reduce((acc, n) => {
    const di = n.decoded.dataIndex || 'unknown';
    acc[di] = (acc[di] || 0) + 1;
    return acc;
  }, {})
// { entityData: 10, entityGovernData: 4, configData: 2 }

// All paths requested across the session (for manual duplicate analysis)
window.__LDS_NETWORK_LOG__
  .filter(n => n.decoded?.paths)
  .flatMap(n => n.decoded.paths)
  .map(p => JSON.stringify(p))
```

---

## Sanity check

```js
// Confirm FalcorDecoder is registered and working:
window.__LDS_NETWORK_LOG__.filter(n => n.decoded?.protocol === 'falcor').length
// 0 → either no Falcor calls captured yet, or FalcorDecoder not registered
// N → N calls decoded

// Check what dataIndexes were called:
[...new Set(
  window.__LDS_NETWORK_LOG__
    .filter(n => n.decoded?.protocol === 'falcor')
    .map(n => n.decoded.dataIndex)
)]
// ["entityData", "entityGovernData", "configData", ...]

// Verify path anatomy on one call:
window.__LDS_NETWORK_LOG__.find(n => n.decoded?.protocol === 'falcor')?.decoded
// { dataIndex: "entityData", pathCount: 15, entityTypes: ["sku"], entityIds: [...], fields: [...], ... }
```

If `decoded` is null for all Falcor calls:
```js
// Check if FalcorDecoder is registered (via custom/ui-platform index.js):
// Open Network tab → expand any /data/*.json call → does it show "decoded" type?
// If not: FalcorDecoder is not registered. Import custom/ui-platform/index.js in your app entry.
```

---

## What you'll see in the Falcor tab

```
[Grouped ●] [By DataIndex] [Search Sessions]    14 calls · 187 paths · 3 dataIndexes · ⚠ 4 dup paths

[All dataIndexes ▼]  [Filter by entityType, field, entityId…                    ]

┌─────────────────────────────────────────────────────────────────────────────┐
│ Burst 1  847ms  entityData×3 · entityGovernData×2  12 IDs  parallel         │ ▼
├─────────────────────────────────────────────────────────────────────────────┤
│   GET  entityData  423ms  +0ms   15p  12 IDs  [sku]                  48KB ▼ │
│       Entity IDs (12): id1, id2, id3, … +9 more                            │
│       Fields (4): [id] [name] [attributes 4×] [relationships]              │
│       15 paths: (expandable list, DUP labels on repeated paths)            │
│                                                                             │
│   GET  entityGovernData  389ms  +5ms  8p  12 IDs  [sku]             12KB ▼ │
│   GET  configData  35ms  +8ms  3p                                    2KB ▼  │
├─────────────────────────────────────────────────────────────────────────────┤
│ Burst 2  2340ms  entityData×1  48 IDs  ⚠ 1 dup path  sequential     ▼      │
└─────────────────────────────────────────────────────────────────────────────┘

Session analytics
Entity types:  [sku 12×]  [product 2×]
Top fields:    [attributes 54×]  [relationships 38×]  [name 22×]  [id 18×]
⚠ 4 duplicate paths detected — same data requested in multiple separate calls.
  Consider batching these.
```

---

## Limitations

**Path structure is best-effort.** `entityTypes`, `entityIds`, and `fields` are extracted by scanning for `byIds` in each path. If a Falcor model uses a different path structure (no `byIds` segment), these fields will be empty and you'll need to look at the raw `paths` array.

**Burst grouping is time-based, not causal.** Calls within 200ms of each other are grouped regardless of whether they're actually related. In a busy app, two unrelated operations could land in the same burst if they fire close together.

**No server-side fan-out visibility.** When the Syndigo server splits one Falcor GET into multiple backend calls per entity type, that's opaque to the browser. The tab shows what the browser sent, not what the server did with it.

**Log cap at 200 entries.** `window.__LDS_NETWORK_LOG__` is capped at 200 entries (managed by `network.js`). On heavily-loaded pages, early Falcor calls may be pushed out of the log by the time you open the panel.

**dataIndex from URL only.** The `dataIndex` field is extracted from the URL (`/data/entityData.json` → `entityData`). If the same endpoint is called from multiple contexts with different logical meanings, they'll appear as one dataIndex group.

---

## Relationship to other tools

| Tool | How it relates |
|---|---|
| [Network Monitor](08-network.md) | The Falcor tab reads the same `__LDS_NETWORK_LOG__` data. Network tab = raw view of all requests. Falcor tab = Falcor-specific structured view. |
| [Slow API Monitor](05-slow-api.md) | SlowAPI detects slow *method calls* on `window.__dataObjectManager__`. Falcor tab detects slow *network requests*. They complement each other: SlowAPI catches slowness from component → DataObjectManager; Falcor tab catches slowness from DataObjectManager → server. |
| [Workflow Baseline](11-workflow-baseline.md) | Baseline captures `networkCount` and `networkFailures` from the full network log, including Falcor calls. A baseline showing `networkCount: 14` means 14 total calls in a normal session — a current session with 28 calls would show a divergence. |
