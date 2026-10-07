# Plan: Falcor Master Toolkit — `lit-debug-suite` Falcor Tab

## Context

The Network tab in the debug panel currently shows Falcor calls as flat rows with identical-looking names (entityData × 10, entityGovernData × 4). The root cause is threefold:

1. **FalcorDecoder only stores the first path** from the POST body — a single Falcor POST can carry 15+ collapsed paths covering multiple entity types, IDs, and fields, but only `paths[0]` is decoded.
2. **The panel has no grouping** — calls that fired together (same user action, same bolt pipeline run) appear as unrelated rows.
3. **No path anatomy** — users can't see which entity types, IDs, or fields were requested, so "entityData" tells you nothing useful.

The architecture that makes this hard (confirmed from codebase):
- Each `dataIndex` has its own XHR endpoint (`/data/entityData.json`, `/data/entityGovernData.json`, etc.) — so one component load triggers N separate XHRs, one per dataIndex.
- `GetByIdsBolt` fires multiple sequential `FalcorManager.get()` calls in a single operation (prelim field keys, relationship IDs, main data, chunks) — each becomes its own XHR.
- Falcor uses `ImmediateScheduler` (synchronous flush) — XHRs fire in the same call stack as `FalcorManager.get()`.
- No correlation/trace IDs exist in the HTTP layer. Time-proximity + dataIndex is the reliable grouping signal.
- Search sessions have a natural correlation: `searchResults.create` returns a `requestId` that appears as a path key in subsequent paginated GETs.

**User confirmed: new "Falcor" tab (not an enhanced mode of the existing Network tab).**

---

## What Gets Built

### 5 capabilities in the Falcor tab:

| Capability | What the user sees |
|---|---|
| **Full path anatomy** | Every POST shows ALL decoded paths, broken down: dataIndex / domain / entityType / entityIds / fields |
| **Burst grouping** | Calls within 200ms of each other grouped as "same action" — shows the 1 action → N XHR fan-out |
| **DataIndex grouping** | All entityData calls together, all entityGovernData calls together, with per-group totals |
| **Search session linking** | `searchResults.create` and the subsequent paginated GETs shown as a linked session |
| **Path analytics** | Most-fetched entity types, most-requested fields, duplicate path detection (cache miss indicator) |

---

## Files to Create / Modify

### 1. `custom/ui-platform/FalcorDecoder.js` — EXTEND decoded shape

Add to the returned decoded object (keeping all existing fields for backwards compat):

```js
// NEW fields:
paths:          [[...], [...], ...],   // full parsed paths array (was discarded after callPath extraction)
pathCount:      15,                    // number of path arrays in this POST
dataIndex:      'entityData',          // reliable channel name (root[1] of path OR from URL)
entityTypes:    ['sku', 'product'],    // unique values from root[3] position across all paths
entityIds:      ['id1', 'id2'],       // values inside byIds[] key-sets across all paths
fields:         ['id', 'name', 'type'], // leaf segments (fields/attributes requested)
isSearch:       false,                 // true if callPath includes 'searchResults.create'
searchRequestId: null,                 // for search result GETs: the requestId key embedded in path
isBatchGet:     true,                  // pathCount > 1
```

Implementation notes:
- `_parseFalcorBody` already parses `params.paths` JSON → extend to store ALL entries, not just `[0]`
- Extract `entityTypes` by iterating all paths and reading index `[3]` (the type position after `root[dataIndex][domain]`)
- Extract `entityIds` by finding the `byIds` key and reading the next segment (array or string)
- Extract `fields` from leaf segments of each path
- Detect `searchRequestId` by checking if any path segment after `searchResults` is a non-numeric string that looks like a UUID/opaque ID (not a range object)

### 2. `custom/ui-platform/FalcorNetworkEnhancer.js` — NEW

Pure analysis module (no DOM, no patches). Exported functions consumed by the panel:

```js
// Group all Falcor entries from __LDS_NETWORK_LOG__ into burst groups
// A burst group = calls whose `ts` timestamps are within 200ms of each other
export function getBurstGroups(networkLog)
// Returns: [{ groupId, startTs, endTs, calls[], totalMs, dataIndexes[], entityTypes[] }]

// Group by dataIndex across the full session
export function getDataIndexGroups(networkLog)
// Returns: { entityData: [...calls], entityGovernData: [...calls], ... }

// Link search sessions: match CALL entries (isSearch=true) to subsequent
// GET entries whose path contains the same searchRequestId
export function getSearchSessions(networkLog)
// Returns: [{ initiateCall, resultCalls[], requestId }]

// Per-session analytics
export function getPathAnalytics(networkLog)
// Returns: {
//   totalCalls, totalPaths, totalMs,
//   entityTypeFreq: { sku: 47, product: 12 },
//   fieldFreq: { name: 62, attributes: 54, ... },
//   entityIdFreq: { 'id1': 8 },          // hot entities (fetched > 1 time = cache miss)
//   avgPathsPerCall: 12.3,
//   largestCall: { url, pathCount, ms },
// }

// Detect duplicate paths (same path requested in multiple separate calls)
export function getDuplicatePaths(networkLog)
// Returns: [{ pathKey, count, calls[] }]
```

### 3. `src/panel/LdsDebugPanel.js` — ADD Falcor TAB

**In `TABS` array (line ~646):** add `{ key: 'falcor', label: 'Falcor' }` after `'network'`.

**In `_renderContent()` (line ~1335):** add `case 'falcor': return this._renderFalcor();`

**New state properties (in constructor):**
```js
_falcorViewMode = 'grouped';        // 'grouped' | 'timeline' | 'search'
_falcorDataIndexFilter = 'all';     // 'all' | 'entityData' | 'entityGovernData' | ...
_falcorPathSearch = '';             // free-text filter on paths/entityType/field
_falcorExpandedGroup = null;        // which burst group is expanded
_falcorExpandedCall = null;         // which individual call is expanded within a group
```

**`_renderFalcor()` layout:**

```
Tab header: View: [Grouped ●] [Timeline] [Search Sessions]   Stats: 14 calls · 47 paths · 3 dataIndexes
Filter row: [dataIndex: All ▼] [Search paths/types/fields: ____]

─── GROUPED VIEW ───
▼ Action burst — 3 calls — 847ms total — entityData, entityGovernData, configData
  ├─ POST /data/entityData.json        423ms  15 paths
  │    ↳ sku × 2 IDs · fields: id, name, attributes, relationships  [▼ expand paths]
  │       [path anatomy table when expanded]
  ├─ POST /data/entityGovernData.json  389ms  8 paths
  │    ↳ sku × 2 IDs · fields: score, status, workflowName
  └─ POST /data/configData.json        35ms   3 paths
       ↳ uiConfig × 3 IDs · fields: id, data

▼ Action burst — 1 call — 2340ms ⚠ SLOW
  └─ POST /data/entityData.json  2340ms  1 path
       ↳ sku × 48 IDs · fields: id, name  [▼ expand]

─── SEARCH SESSIONS ───
▼ Search session — initiated Oct 6 10:14:32
  ├─ CALL entityData.searchResults.create → requestId: abc123   180ms
  └─ GET  entityData.searchResults[abc123].items[0..24]          650ms

─── ANALYTICS SECTION (collapsible) ───
Hot entities (fetched > 1×): ent-abc (4×), ent-xyz (3×)
Most requested fields: attributes (54), relationships (38), name (22)
Largest call: /data/entityData.json — 48 entity IDs — 2340ms
```

**Path anatomy table (expanded call view):**
```
Index  Root      DataIndex    Domain   EntityType  EntityIds       Fields
0      root      entityData   generic  sku         ["id1","id2"]   id, name
1      root      entityData   generic  sku         ["id1","id2"]   attributes.*
2      root      entityData   generic  sku         ["id1","id2"]   relationships.hasImages.*
```

### 4. `src/core/gate.js` — ADD FLAG

Following the existing pattern at the top of the file:
- Add JSDoc: `window.__LDS_FALCOR_VIEW__` flag
- Add `_toolEnabled` entry: `if (toolKey === 'falcorView' && window.__LDS_FALCOR_VIEW__) return true;`

The tab renders its data purely from `window.__LDS_NETWORK_LOG__` (already populated by `__LDS_NETWORK_ENABLED__`). The flag controls whether the tab appears; `__LDS_NETWORK_ENABLED__` must also be set for data.

### 5. `custom/ui-platform/index.js` — REGISTER

Import and call any setup from `FalcorNetworkEnhancer.js` if it needs registration (likely none — it's pure functions operating on the existing log). No new patches needed.

---

## What's NOT in scope (deliberately)

- **Perfect component → XHR attribution**: Falcor's async Promise chains between bolt stages make microtask-based correlation unreliable. Time-proximity burst grouping is the pragmatic equivalent.
- **Server-side fan-out visibility**: When the server splits one Falcor GET into multiple backend calls per entity type, that's entirely opaque to the browser. Not captured.
- **FalcorManager.get() hooks**: Not needed for the core value. Can be Phase 2 if burst grouping isn't precise enough.
- **Modifying `ui-platform-dataaccess`**: No changes to that codebase. All analysis is done from the captured XHR bodies.

---

## Reuse Notes

- Expand/collapse pattern: reuse `_expandedNetIdx` pattern from `_renderNetwork()` for `_falcorExpandedCall`
- Burst group toggle: reuse `_baselineOpen` boolean toggle pattern from `_renderWorkflowBaseline()`
- Entity type pills: reuse existing `.tag-pill` CSS + rendering from `_renderNetExpand()` lines ~1592–1595
- View mode tabs within a tab: reuse the same `<button class="tab">` pattern from `_renderTabs()`, scoped inside `_renderFalcor()` as a secondary nav row

---

## Verification

1. Set `window.__LDS_NETWORK_ENABLED__ = true` → reload
2. Navigate to an entity detail page (triggers entityData + entityGovernData + configData calls)
3. Open panel → **Falcor tab**
4. Check:
   - Burst groups present (3 calls grouped if they fired within 200ms)
   - Each call shows pathCount, entityTypes, entityIds, fields
   - Expanding a call shows full path anatomy table
   - Analytics section shows field frequency, hot entities
5. Navigate to a search page → run a search
6. Check **Search Sessions** view: initiate + paginated GET linked by requestId
7. Check path filter: type "sku" in path search → only calls with sku paths show
8. Check dataIndex dropdown: select "entityGovernData" → only governData calls show
